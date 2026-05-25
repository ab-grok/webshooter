// JWT_SECRET	Secret
// SHOOTERAPI	Plain text
// SHOOTER_AGENT	Plain text

import puppeteer from "@cloudflare/puppeteer";
import * as jose from "jose";

// for incoming requests: I send payload (keys) in body for 'delete' call, as array in URL for bulk deletion may exceed the url 2byte limit (correct the actual size limit)
//for incoming/outgoing requests: I set up jwtSign signing the same secret on both ends (worker + next app), check that it interoperates properly.
//check that there are no operational deficiencies and check the interoperability of each fetch endpoint and the corresponding route in the next app.
export default {
  async fetch(req, env) {
    try {
      const token = req.headers.get("Authorization");
      const secret = new TextEncoder().encode(env.JWT_SECRET);
      await jose.jwtVerify(token, secret); // throws when verification fails so no need for return error.

      const url = new URL(req.url);
      const getShotUrls = url.searchParams.get("getShotUrls"); //expects array
      const getShot = url.searchParams.get("getShot"); //expects array
      const getHtml = url.searchParams.get("getHtml"); //expects string
      const delShot = url.searchParams.get("delShot"); //expects array

      if (!getShotUrls && !delShot && !getHtml && !getShot)
        throw { error: "Invalid search param" };

      if (getShot) {
        const shotKey = (await req.json()).key;

        const shotBin = await env.SHOT_BUCKET.get(shotKey); //Expecting the binary which is a Uint8Array I reckon? or is it an ArrayBuffer -- need this for download parsing.
        if (!shotBin) throw { error: "R2 shot not found" };

        return Res({ shotBin });
      }

      if (getShotUrls) {
        //imageUrl: {url, key}[]
        //body.keys: string[]
        const shotKeys = (await req.json()).keys;
        if (!shotKeys.length) throw { error: "Empty keys array!" };
        const expiresIn = 3600 * 24 * 7;

        const keysData = await Promise.all(
          shotKeys.map((key) => {
            const url = env.SHOT_BUCKET.getSignedUrl(key, { expiresIn });
            return { url, key };
          }),
        );

        if (!keysData.length) throw { error: "No R2 shots for passed keys!" };

        return Res({ keysData });
      }

      if (getHtml) {
        const htmlKey = (await req.json()).key;
        const html = await env.SHOT_BUCKET.get(htmlKey).text();

        if (!html) throw { error: "R2 html not found!" };

        return Res({ html });
      }

      //await a flatmap of [shot,html] per shotKey deletion
      if (delShot) {
        const shotKeyArr = (await req.json()).keys;

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
      return Res(e.error || e, "error");
    }
  },

  async scheduled(event, env, ctx) {
    //will probably handle multicrons (crons with intersecting schedules) by updating a durable object with cron schedule and filtering.

    const cron = event.cron;

    try {
      const fetchProps = { cron, env, endpoint: "/getCronSites" };
      fetchProps["method"] = "GET";

      const { Auth, data } = await Fetch(fetchProps);

      console.log("In scheduled", { Auth, data });
      const { readySites, id, error } = data;
      if (!readySites) throw "Could not get readySites for Cron: " + cron;

      const shotProps = { readySites, id, cron, Auth, env };
      await takeShots(shotProps);
    } catch (e) {
      console.error("Error in scheduled: ", e);

      const body = { msg: "Error in scheduled: " + JSON.stringify(e) };
      const fetchProps = { Auth, cron, env, body, method: "POST" };
      await Fetch({ ...fetchProps, endpoint: "/setNotification" });
    }
  },
};

async function takeShots({ readySites, id, cron, Auth, env }) {
  try {
    const browser = await puppeteer.launch(env.CHROME);

    console.log("in takeShots", { readySites, id, cron, Auth, env });
    //loop may break free tier's 10ms CPU time limit. -- eased now since API calls are made to
    for (const { site, range, user } of readySites) {
      try {
        if (!site || !user)
          throw "Missing params. Site: " + site + ", User: " + user;

        const page = await browser.newPage();
        const UA = env.SHOOTER_AGENT; //"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
        await page.setUserAgent(UA);

        const stats = await page.goto(site);

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

        const msg = `Error in readySites, Site: ${site}, User: ${user}, Error: ${JSON.stringify(e)}`;
        const fetchProps = { Auth, cron, env, body: { msg }, method: "POST" };
        await Fetch({ ...fetchProps, endpoint: "/setNotification" }); //Check `src/app/api/setNotification/route.ts` that I access 'msg' correctly?
      } finally {
        if (page) await page.close();
      }
    }

    return;
    //make sure that not more than 5 users pegged to cron to maintain worker limits
  } catch (e) {
    console.error("Error in getShotUrls: ", e);

    const body = { msg: "Error in getShotUrls: " + JSON.stringify(e) };
    const fetchProps = { Auth, cron, env, body, method: "POST" };
    await Fetch({ ...fetchProps, endpoint: "/setNotification" });
  } finally {
    if (browser) await browser.close();
  }
}

//--------> helper functions

async function Fetch({ Auth, cron, env, body, endpoint, method }) {
  //body:{};

  console.log("in Fetch", { Auth, cron, body, env, endpoint, method });
  !Auth && (Auth = await createJWT({ cron, env }));

  console.log("In Fetch, passed Auth after reassignmment", { Auth });
  const headers = {
    Authorization: Auth,
    "Content-Type": "application/json",
  };

  const res = await fetch(env.SHOOTERAPI + endpoint, {
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
  //gets Uint8Array binary of secret
  const secret = new TextEncoder().encode(env.JWT_SECRET);

  return await new jose.SignJWT({ cron })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt() //this doesn't seem integral -- can remove?
    .setExpirationTime("1m")
    .sign(secret);
}

function Res(body, error) {
  //do I have to strigify body when its an object?
  return new Response(JSON.stringify(body), {
    status: error ? 400 : 200,
  });
}

async function storeShot({ shot, html, cron, site, user, env }) {
  //get a date string in format: YYYY-MM-DD_hh.mm.ss
  let date = new Date().toLocaleString("sv-SE", { timeZone: "UTC" });
  date = date.replace(/ /, "_").replace(/:/, ".");

  const shotKey = `shot/${user}/${site}_${date}.jpeg`;
  const htmlKey = `html/${user}/${site}_${date}.html`;

  if (!shot) shot = `Shot failed to save. Cron: ${cron}, site: ${site}`;
  const contentType = shot ? "image/jpeg" : "text/plain";

  //what's the value of shotReturn here? wondering if I can getSignedUrl.
  const shotReturn = await env.SHOT_BUCKET.put(shotKey, shot, {
    httpMetadata: { contentType },
  });

  const htmlReturn = await env.SHOT_BUCKET.put(htmlKey, html, {
    httpMetadata: { contentType: "text/html" },
  });

  return { shotKey, htmlKey };
}
