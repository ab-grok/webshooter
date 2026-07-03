//webworker.js

import puppeteer from "@cloudflare/puppeteer";
import * as jose from "jose";

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
        const keysData = reqBody; //this is how you access the body?

        if (!keysData.length) throw { error: "Empty keysData array!" };

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
        const shotKeyArr = reqBody.keys;

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

      console.log("In scheduled", { Auth, data });
      const { readySites, id, error } = data;
      if (error) throw error;
      if (!readySites) throw "Could not get readySites for Cron: " + cron;

      const shotProps = { readySites, id, cron, Auth, env };
      await takeShots(shotProps);
    } catch (e) {
      console.error("Error in scheduled: ", e);

      const body = {
        msg: "Error in scheduled: " + JSON.stringify(e.message || e),
      };
      const fetchProps = { cron, env, body, method: "POST" };
      await Fetch({ ...fetchProps, endpoint: "/setNotification" });
    }
  },
};

//function for taking and stroing Shots and storing HTML
async function takeShots({ readySites, id, cron, Auth, env }) {
  let browser;
  try {
    browser = await puppeteer.launch(env.CHROME);

    console.log("in takeShots", { readySites, id, cron, Auth, env });
    //loop may break free tier's 10ms CPU time limit. -- eased now since API calls are made to
    for (const { site, range, user } of readySites) {
      if (!site || !user)
        throw "Missing params. Site: " + site + ", User: " + user;

      let page;
      try {
        page = await browser.newPage();
        const UA = env.SHOOTER_AGENT; //"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
        await page.setUserAgent(UA);

        const pSite = !site.startsWith("http") ? `https://${site}` : site;

        const stats = await page.goto(pSite);

        if (stats.status() >= 400) {
          console.error(`in takeShots. Page broken. Status`, stats);
          //can continue and set notification, or store broken page as is -- storing broken page as is for experimentation (is low html file size regardless).
        }

        const html = await page.content();

        const pageArg = { type: "jpeg", quality: 80, encoding: "binary" };
        const shot = await page.screenshot({ fullPage: true, ...pageArg });

        const storeProps = { shot, html, cron, site, user, env };
        const { shotKey, htmlKey } = await storeShot(storeProps);

        //range is impractical in R2 -- cannot reliably probe prev entries for html content. Or can I?
        //would be possible if there are R2 BUCKET query methods are there besides put, get, delete?
        const shotData = { shotKey, htmlKey, range, site, user, id };

        const fetchProps = { cron, Auth, env, endpoint: "/makeEntry" };
        await Fetch({ ...fetchProps, method: "POST", body: shotData });
      } catch (e) {
        console.error("Error in takeShot > for loop: ", e);

        const msg = `Error in readySites, Site: ${site}, User: ${user}, Error: ${JSON.stringify(e.message || e)}`;
        const fetchProps = { Auth, cron, env, body: { msg }, method: "POST" };
        console.error(msg);
        await Fetch({ ...fetchProps, endpoint: "/setNotification" }); //Check `src/app/api/setNotification/route.ts` that I access 'msg' correctly?
      } finally {
        await page?.close();
      }
    }

    //make sure that not more than 5 users pegged to cron to maintain worker limits
  } catch (e) {
    console.error("Error in getShotUrls: ", e);

    const body = {
      msg: "Error in getShotUrls: " + JSON.stringify(e.message || e),
    };
    const fetchProps = { Auth, cron, env, body, method: "POST" };
    await Fetch({ ...fetchProps, endpoint: "/setNotification" });
  } finally {
    await browser?.close();
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
  }); //this accessible by await req.json() or await req.json().body?

  const data = await res?.json();
  console.log("In fetch, data from endpoint", { endpoint, Auth, data });
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

  if (!shot) shot = `Shot failed to save. Cron: ${cron}, site: ${site}`;

  //what's the value of shotReturn here? wondering if I can getSignedUrl.
  const shotReturn = await env.SHOT_BUCKET.put(shotKey, shot, {
    httpMetadata: { contentType: "image/jpeg" },
  });

  const htmlReturn = await env.SHOT_BUCKET.put(htmlKey, html, {
    httpMetadata: { contentType: "text/html" },
  });

  return { shotKey, htmlKey };
}
