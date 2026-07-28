//webworker.js

import puppeteer from "@cloudflare/puppeteer";
import * as jose from "jose";

//Expecting svhedule conflicts -- SHould store schedule time in durable object and prevent another invocation from oppening browser
// for incoming requests: I send payload (keys) in body for 'delete' call, as array in URL for bulk deletion may exceed the url 2byte limit (correct the actual size limit)
//for incoming/outgoing requests: I set up jwtSign signing the same secret on both ends (worker + next app), check that it interoperates properly.
//check that there are no operational deficiencies and check the interoperability of each fetch endpoint and the corresponding route in the next app.
export default {
  async fetch(req, env) {
    try {
      const token = req.headers.get("Authorization");
      if (!token) throw "Missing Authorization Token!";
      const secret = new TextEncoder().encode(env.JWT_SECRET);
      await jose.jwtVerify(token, secret); // throws when verification fails so no need for return error.

      let reqBody = await req.json();
      const url = new URL(req.url);
      const getUrls = url.searchParams.get("getUrls"); //expects {shotKey, htmlKey}[]
      const delShot = url.searchParams.get("delShot"); //expects array
      // const getShot = url.searchParams.get("getShot"); //expects string -- Deprecated -- Shot is downloaded directly from presignedURL
      // const getHtml = url.searchParams.get("getHtml"); //expects string -- Deprecated -- Shot is downloaded directly from presignedURL

      if (!getUrls && !delShot) throw { error: "Invalid search param" };

      if (getUrls) {
        const keysData = Array.isArray(reqBody) ? reqBody : [];

        if (!keysData?.length) throw { error: "Empty keysData array!" };

        const urlData = [];
        const expiresIn = 3600 * 24 * 7;
        for (const { shotKey, htmlKey } of keysData) {
          const sUrl = await env.SHOT_BUCKET.getSignedUrl(shotKey, {
            expiresIn,
          });
          const hUrl = await env.SHOT_BUCKET.getSignedUrl(htmlKey, {
            expiresIn,
          });

          urlData.push({ shotUrl: sUrl, htmlUrl: hUrl, shotKey });
        }

        if (!urlData.length) throw { error: "No R2 shots for passed keys!" };

        return Res(urlData);
      }

      // //Deprecated. Can download from presignedUrls.
      // if (getShot) {
      //   const shotKey = (reqBody).key;
      //
      //   const shotBin = await env.SHOT_BUCKET.get(shotKey); //Expecting the binary which is a Uint8Array I reckon? or is it an ArrayBuffer -- need this for download parsing.
      //   if (!shotBin) throw { error: "R2 shot not found" };

      //   return Res(await shotBin.arrayBuffer());
      // }
      //
      // //Deprecated. Can download with presignedUrls
      // if (getHtml) {
      //   const htmlKey = (reqBody).key;
      //   const html = await env.SHOT_BUCKET.get(htmlKey);
      //   if (!html) throw { error: "R2 html not found!" };

      //   return Res({ html: await html.text() });
      // }

      //await a flatmap of [shot,html] per shotKey deletion
      if (delShot) {
        const shotKeyArr = Array.isArray(reqBody?.keys) ? reqBody.keys : [];
        if (!shotKeyArr?.length)
          throw { error: "In DelShot; Empty shotKeysArr!" };

        const delPromises = shotKeyArr.flatMap((shotKey) => {
          const htmlKey = shotKey
            .replace(/^shot/, "html")
            .replace(/jpeg$/, "html");

          return [
            env.SHOT_BUCKET.delete(shotKey),
            env.SHOT_BUCKET.delete(htmlKey),
          ];
        });

        await Promise.all(delPromises);

        return Res({ error: null });
      }

      return Res({ API: "Active!" });
    } catch (e) {
      console.error(e);
      return Res({ error: e?.error || e });
    }
  },

  //crons execute this function on schedule
  //will probably handle multicrons (crons with intersecting schedules) by updating a durable object with cron schedule and filtering.
  async scheduled(event, env, ctx) {
    const cron = event.cron;

    try {
      const fetchProps = { cron, env, endpoint: "/getCronSites" };
      fetchProps["method"] = "GET";

      const { Auth, data } = await Fetch(fetchProps);

      console.log("In scheduled; Received data from fetch", { data });
      const { readySites, id, error } = data;

      if (error) throw error;
      if (!readySites?.length)
        throw `readySites is non-existent or empty: ${JSON.stringify({ readySites, cron })}`;

      const shotProps = { readySites, id, cron, Auth, env };
      await takeShots(shotProps);
    } catch (e) {
      console.error("Error in scheduled: ", e);

      const body = {
        msg: "Error in scheduled: " + JSON.stringify(e?.message || e),
      };
      const fetchProps = { cron, env, body, method: "POST" };
      await Fetch({ ...fetchProps, endpoint: "/setNotification" });
    }
  },
};

async function launchBrowserWithRetry(env, attempts = 3) {
  let error;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      console.log(`Launching browser attempt ${attempt}/${attempts}`);
      return await puppeteer.launch(env.CHROME, {
        protocolTimeout: 5000,
      });
    } catch (err) {
      error = err;
      console.error(
        `In launchBrowserWithRetry: Browser launch attempt ${attempt}/${attempts} failed`,
        err,
      );
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  if (error) throw "Browser launch failed!";
}

//function for taking and stroing Shots and storing HTML
async function takeShots({ readySites, id, cron, Auth, env }) {
  await new Promise((fn) => setTimeout(fn, Math.random() * 500)); //random wait to prevent collision from incidenting crons

  let browser;
  try {
    browser = await launchBrowserWithRetry(env);
    console.log("in takeShots", { readySites, id, cron, Auth, env });

    //loop may break free tier's 10ms CPU time limit.
    for (const { site, range, user } of readySites) {
      if (!site || !user)
        throw `Missing params; ${JSON.stringify({ site, user })}`;

      console.log("In takeShots > forLoop!");

      let page;
      try {
        page = await browser?.newPage();
        if (!page) throw "browser.newPage() failed to initialise!"; //is this proper check for failed page initialisation or perhaps page releases some methods to check for init errors?

        const UA = env.SHOOTER_AGENT; //"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
        await page.setUserAgent(UA);
        await page.setViewport({ width: 1920, height: 1080 });

        const rSite = !site.startsWith("http") ? `https://${site}` : site;

        // helper: try to load the page, optionally retry once. Returns pageStats or null on failure.
        async function loadPage(retries = 3) {
          for (let retry = 1; retry <= retries; retry++) {
            try {
              const l1 = `In loadPage: loading '${rSite}'. Attempt (${retry}/${retries}) `;
              console.log(l1);

              const stats = await page?.goto(rSite, {
                timeout: 60_000, //Max time fr page navigation!
                waitUntil: "networkidle2", //Record success navigation when <= 2 networkcalls in flight.
              });

              const l2 = `In loadPage: page load success! Status: '${stats.status()}'`;
              console.log(l2);

              return stats;
            } catch (e) {
              console.error(`In loadPage: Page load error: '${e}'`);
              if (retry == retries) throw "Page load failure!";
            }
          }
        }

        let m = "In takeshots: Right before 'loadPage()': ";
        console.log(m, { UA, rSite, page });

        const pageStats = await loadPage();
        //Notify user of non-puppeteer page load errors
        if (pageStats.status() >= 400) {
          const msg = `Couldn't take shot: Page broken; Site: '${site}', User: '${user}', Status: '${p?.status()}'`;

          const props0 = { Auth, cron, env, method: "POST" };
          const props1 = { body: { msg, user }, ...props0 };
          const fetchProps = { ...props1, endpoint: "/setNotification" };

          console.error(msg);
          await Fetch(fetchProps);

          await page?.close();
          continue; // skip to next readySite;
        }

        m = "In takeshots: for Loop: After pageStats: ";
        console.log(m, { UA, rSite, pageStats });

        const html = await page.content();

        const pageArg = { type: "jpeg", quality: 90, encoding: "binary" };
        const shot = await page.screenshot({ fullPage: true, ...pageArg });

        console.log("In takeShots: Shot taken; partHtml: ", html.slice(0, 100));

        const storeProps = { shot, html, cron, site, user, env };
        const { shotKey, htmlKey } = await storeShot(storeProps);

        console.log("In takeShots: Right after storeShot;");

        const shotData = { shotKey, htmlKey, range, site, user, id };
        const fetchProps = { cron, Auth, env, endpoint: "/makeEntry" };

        await Fetch({ ...fetchProps, method: "POST", body: shotData });

        console.log("In takeShots: after fetch to makeEntry;");
      } catch (e) {
        const msg = `Error in TakeShots > page, Site: '${site}', User: '${user}', Error: '${JSON.stringify(e?.message || e)}'`;
        const fetchProps = { Auth, cron, env, body: { msg }, method: "POST" };
        console.error(msg);

        await Fetch({ ...fetchProps, endpoint: "/setNotification" });
        await page?.close();
      }
    }
    //Account for free teir? make sure that not more than 5 users pegged to cron to maintain worker limits
  } catch (e) {
    const msg = `Error in takeShots: ${JSON.stringify(e?.message || e)}`;
    const props = { Auth, cron, env, body: { msg }, method: "POST" };
    const fetchProps = { ...props, endpoint: "/setNotification" };

    console.error(msg);
    await Fetch(fetchProps);
  } finally {
    try {
      await browser?.close();
    } catch (closeErr) {
      console.error("Error closing browser:", closeErr);
    }
  }
}

//--------> helper functions
//custo fetch connects to next app api
async function Fetch({ Auth, cron, env, body, endpoint, method }) {
  //body:{};

  console.log("in Fetch", { Auth, cron, body, env, endpoint, method });
  !Auth && (Auth = await createJWT({ cron, env }));

  console.log("In Fetch after Auth reassignmment", { Auth });
  const headers = {
    Authorization: Auth,
    "Content-Type": "application/json",
  };

  const res = await fetch(env.SHOOTER_API + endpoint, {
    method,
    headers,
    ...(method != "GET" ? { body: JSON.stringify(body) } : {}),
  });

  // const data = await res.json() //It's all good. I return json.

  let data;

  try {
    data = await res.json();
  } catch (e) {
    console.error("Error in fetch res: ", await res.clone().text());
  }

  console.log(
    "In fetch, return from endpoint: ",
    JSON.stringify({ endpoint, data }),
  );
  return { Auth, data };
}

//Custom function returning hashed key used in requests.
async function createJWT({ cron, env }) {
  const secret = new TextEncoder().encode(env.JWT_SECRET);

  return await new jose.SignJWT({ cron })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt() //this doesn't seem integral -- can remove?
    .setExpirationTime("1m")
    .sign(secret);
}

//custom response function: stringifies body
function Res(body, error) {
  // const aBody = body instanceof ArrayBuffer ? body : "";

  return new Response(JSON.stringify(body), {
    status: error ? 400 : 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function storeShot({ shot, html, cron, site, user, env }) {
  //get a date string in format: YYYY-MM-DD_hh.mm.ss
  let date = new Date().toLocaleString("sv-SE", { timeZone: "UTC" });
  date = date.replace(/\s+/, "_").replace(/:/, ".");
  const sS = site.replace(/[\.]+/g, "_").replace(/\//g, "");

  const shotKey = `shot/${user}/${sS}_${date}.jpeg`;
  const htmlKey = `html/${user}/${sS}_${date}.html`;

  console.log("In storeShot: ", { date, sS, shotKey, htmlKey });

  if (!shot) shot = `Shot failed to save. Cron: ${cron}, site: ${site}`;

  const shotReturn = await env.SHOT_BUCKET.put(shotKey, shot, {
    httpMetadata: { contentType: "image/jpeg" },
  });

  const htmlReturn = await env.SHOT_BUCKET.put(htmlKey, html, {
    httpMetadata: { contentType: "text/html" },
  });

  const m = "In storeShot; After SHOT_BUCKET put: ";
  console.log({ shotReturn, htmlReturn });

  return { shotKey, htmlKey };
}
