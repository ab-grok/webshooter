//To do:
//Create notepad:jsonb r/w action
//Create changeAdmin({del});
"use server";

import bcrypt from "bcryptjs";
import postgres, { Sql } from "postgres";
import { v4 } from "uuid";
import { unviewedType, shotData, downloadProps, isAdmin } from "./types";
import { createCookie, createJWT, getToken } from "./actions";
import { formatDate, isDate } from "./dateformatter";
import { safeSite } from "./utils";

const db = postgres(process?.env?.DB_CONN, {
  debug: (connection, query, params) => {
    console.log("Query: ", query);
    console.log("Params: ", params);
  },
});

// let db: Sql<{}> = DB(process.env.DB_CONN);

//------> shooterWorker actions
export async function makeEntry({ shotData }) {
  //Id used for removing `failed shot` notifications.
  //sets prevId as fileData when duplicate is found.
  try {
    const dateStr = formatDate(new Date());

    const { shotKey, htmlKey, site, range, user, id } = shotData;
    if (!shotKey || !htmlKey || !user || !site)
      throw { error: "Missing params" };

    const sS = safeSite(site, "noDots");
    const u = db(user);

    if (!sS)
      throw {
        error: "in makeEntry. Site unsafe: " + JSON.stringify({ user, site }),
      };

    const shotCol = db(sS + "_shot_key");
    const htmlCol = db(sS + "_html_key");

    //checks that relevant section of html (range) is unique from previous entry -- Obsolete since R2 move (cannot efficiently probe bucket entries partial value match)
    // const prevId = await entryExists({ htmlData, user });
    // const updHtml = prevId ? prevId : html;

    const r1 =
      await db`insert into public.${u} (${shotCol}, ${htmlCol}) values (${shotKey}, ${htmlKey}) returning id`;

    if (!r1[0].id) throw { error: "in makeEntry. insert failed!" };

    //remove "failed attempt" notification that was set when retrieving users' siteData
    const noti = { msgData: { id }, user, del: true };
    const { error } = await setNotification(noti);
    if (error) throw { error: error };

    return { error: null };
  } catch (e) {
    console.error(`Error in makeEntry: `, e);

    const msgData = { msg: JSON.stringify(e), danger: true };
    const noti = { msgData, logError: true };
    setNotification(noti); //I reckon unawait it does not block program flow but executes regardless?
    return { error: "Error in makeEntry: " + e.error || "" };
  }
}

//Checked that the entry is not similar to a previous:
//Obsolete since R2 -- or is there a non-manual method for enmass probing of R2 bucket entries for partial value matches
async function entryExists({ htmlData, user }) {
  try {
    //checks if the selected html range of new shot matches a previous entry.
    if (!db) throw { error: "Db uninitialised!" };
    const { html, range } = htmlData;
    if (!html) throw { error: `Missing parameters` };

    const { start, end } = range;
    const partHtml = db`%${html.slice(start || 0, end || -1)}%`;

    const u = db(user);

    const r1 =
      await db`select id from public.${u} where date > now() - interval 1 day and html like ${partHtml} order by date desc limit 1`;

    if (r1[0].id) return r1[0].id;

    return null;
  } catch (e) {
    console.error("error in entryExists. ", e);
    return null;
  }
}

export async function delPrevEntry({ cron, site, user }) {
  // called (indirectly) from worker, runs before setting shot: 7 days limit May be underutilization since R2 storage move
  try {
    if (!user || !cron || !site) throw { error: "Missing params." };

    const r1 =
      await db`select "storeDuration" from private.users where username = ${user}`;
    const sD = r1?.[0]?.storeDuration || 7;

    // const storeLimit = new Date();
    // storeLimit.setDate(storeLimit.getDate() - sD);

    //dels both shot and html -- htmlKey will be derived in worker
    const shotCol = db(`${safeSite(site, "noDots")}_shot_key`);
    const u = db(user);

    const r2 =
      await db`delete from public.${u} where ${shotCol} is not null and date < now() - (${sD} * interval '1 days') returning ${shotCol} as "shotKey"`;

    if (!r2.length) {
      console.log("User has no prev shots, may be an error!");
      return { error: null };
    }

    await db`update private.usermeta set total_shots = total_shots + ${r2.length} where username = ${user}`;

    const delShotKeys = r2.map((shotData) => shotData?.shotKey);

    const { error } = await deleteR2Shot(delShotKeys);
    if (error) console.error("In delPrevEntry: " + error);

    return { error: null };
  } catch (e) {
    const params = { msg: "error in delPrevEntry", e, cron, site, user };
    console.error("error in delPrevEntry", params);
    return { error: "error in delPrevEntry" + e?.error || e?.message || e };
  }
}

/**
 * @param {string[]} shotKeysArr
 * @returns {Promise<{error:string|null}>}
 */
async function deleteR2Shot(shotKeysArr) {
  try {
    //Can handle objects, strings, arrays --  unnecessary: pass array;
    // let safeShotKeys = shotKeys; const isObj = typeof shotKeys == "object" && !Array.isArray(safeShotKeys); if (isObj) safeShotKeys = Object.values(shotKeys); else if (!Array.isArray(safeShotKeys)) safeShotKeys = [safeShotKeys]; //is string;

    if (!shotKeysArr?.length)
      throw { error: `Empty shotKeysArr: ${shotKeysArr}` };

    if (!Array.isArray(shotKeysArr)) {
      const error = `shotKeysArr must be an array! shotKeysArr: ${shotKeysArr}`;
      throw { error };
    }

    const Authorization = await createJWT();

    const res = await fetch(`${process.env.WEBWORKER_URL}?delShot=true`, {
      method: "POST",
      headers: { Authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ keys: shotKeysArr }),
    });

    //result can be in json form or text() form.
    const e =
      (await res?.json()) || (await res?.text()) || "Error deleting shot!";

    if (!res.ok) throw { error: (await res.json())?.error || e };
    return { error: null };
  } catch (e) {
    console.error(e);
    return { error: "error in deleteR2Shot: " + e.error || "" };
  }
}

export async function getCronSites(cron) {
  //called from worker -- gets readySites (sites on cron schedule), runs cron cleanup for users whose lastLog > 3mos.
  try {
    const readySites = [];
    let errLogs = [];
    let userInactivePeriod = new Date();
    userInactivePeriod.setMonth(userInactivePeriod.getMonth() - 3);

    const r1 =
      await db`select "cronData" as "cD" from private.crons where cron = ${cron}`;
    const cronsData = r1?.[0]?.cD;
    console.log("In getCronSites. cronsData: ", cronsData);

    if (!cronsData || (cronsData.length == 1 && !cronsData[0]?.site)) {
      //Logs empty cron then del
      const msg = `in getCronSites. Cron schedule '${cron}' missing. Running cleanup!`;
      const eLog = { msgData: { msg }, logError: true };
      setNotification(eLog);
      console.error(msg);

      await db`delete from private.crons where cron = ${cron}`;

      const updW = { user: "Cleaner", cron, del: true };
      const { error } = await updateWorker(updW);
      if (error) throw { error: error };

      console.log(`in getCronSites. Cron: '${cron}' cleaned!`);
      return { error: null };
    }

    //loops over cronsData retreiving siteData per userCron (as cronsData[] entries)
    for (const [i, { site, range, user }] of cronsData.entries()) {
      let erred;

      const r2 =
        await db`select s."lastLog" from private.users u inner join private.sessions s on u.uuid = s.uuid where u.username = ${user} `;
      const lastLog = r2?.[0]?.lastLog;

      console.log(`in getCronSites; cronsData index: : ${i}`, {
        user,
        lastLog,
      });

      //when user is unloggd past 3 months: set user sites and cron inactive & deleted;
      if (!lastLog || userInactivePeriod > new Date(lastLog)) {
        const msg = `User unlogged for 3 months! Cron: '${cron}' on Site: '${site}' and its shots have been purged!`;
        await setNotification({ msgData: { msg, danger: true }, user });
        console.log(msg, lastLog);

        const safeSD = { site, cron, range, user };
        const updCron = { safeSD, user, del: true };

        const { error: delSitesErr } = await setSiteInactive(safeSD);
        const { delWorker, error: delCronErr } = await updateCronTable(updCron);

        let delWorkerErr;
        if (delWorker) {
          const { error: e1 } = await updateWorker(updCron);
          delWorkerErr = e1;
        }

        if (delSitesErr || delCronErr || delWorkerErr) {
          erred = true;

          const errorsArr = Object.entries({
            delSitesErr,
            delCronErr,
            delWorkerErr,
          });
          const errors = Object.fromEntries(
            errorsArr.filter(([key, val]) => Boolean(val)),
          );

          errLogs.push({ user, cron, ...errors });
        }
      }

      //When cron exists: remove previous keys greater than 7 days -- can probably go higher since R2 bucket has 10GB storage limit .
      const { error: delPrevErr } = await delPrevEntry({ cron, site, user });
      if (delPrevErr) {
        //mutate "errorLogs" to include delPrevErr;
        erred = true;
        const thisLog = errLogs.find((e) => e?.user == user) || { user, cron };
        errLogs = [
          ...errLogs.filter((e) => e?.user != user),
          { ...thisLog, delPrevErr },
        ];
      }

      if (erred) continue; //Do not push to readySites when erred;
      readySites.push({ user, site, range });
    }

    //Accounting for worker timeout scenario -- users get pessimistically notified of failed attempt, this is later removed on successful write.
    const msg = `Shot failed to save: Cron ${cron} fired on ${formatDate(new Date())}.`;
    const user = readySites.map((s) => s.user);
    const msgData = { msg, danger: true };
    const { id } = await setNotification({ msgData, user });

    //Erred during loop: Logs error per user.
    errLogs.forEach((e) => {
      const msgData = { msg: JSON.stringify(e), danger: true };
      setNotification({ msgData, logError: true });
    });

    return { readySites, id };
  } catch (e) {
    console.error("error in getCronSites: ", e);
    const eLog = { msgData: { msg: JSON.stringify(e) }, logError: true };
    setNotification(eLog);
    return { error: e };
  }
}

//------------------------------------------------------------------------> cron scheduling

export async function updateShotSchema({ site, user, del }) {
  //creates a table for user in root db with default cols. Can also delete siteCols (site)
  //usermeta = id, username, total_shots, total_sites
  try {
    const saferSite = safeSite(site, "noDots");
    if (!saferSite) throw { error: "Unsafe site: " + site };
    const { tableName, userSites } = await getUserSites({ user });

    const u = db(user);
    const htmlCol = db(saferSite + "_html_key");
    const shotCol = db(saferSite + "_shot_key");

    if (!tableName) {
      if (del)
        await db`create table public.${u} (id serial primary key, date timestamptz default now())`;
      else {
        await db`create table public.${u} (id serial primary key, date timestamptz default now(), viewed boolean default false, key_expires timestamptz default now(), ${shotCol} text, ${htmlCol} text, shot_url text, html_url text)`;
        await db`insert into private.usermeta (username, total_sites) values (${user}, 1)`;
      }
    } else {
      const alterTb = db`alter table public.${u}`;
      if (del) {
        //deleting site from an existing table
        const dR =
          await db`delete from public.${u} where ${shotCol} is not null returning ${shotCol}`;
        await db`${alterTb} drop column ${htmlCol}, drop column ${shotCol}`;

        if (dR?.length)
          await db`update private.usermeta set total_shots = total_shots + ${dR.length} where username = ${user}`;
      } else {
        //Adding site to existing table
        const sameCol =
          await db`select column_name from information_schema.columns where table_name = ${user} and table_schema = 'public' and column_name = ${shotCol}`;

        if (!sameCol.length) {
          //shot/htmlCol do not exist and don't need 'if not exists' check.
          await db`${alterTb} add column if not exists viewed boolean default false, add column if not exists key_expires timestamptz default now(), add column ${htmlCol} text, add column ${shotCol} text, add column if not exists shot_url text, add column if not exists html_url text`;
          await db`update private.usermeta set total_sites = total_sites + 1 where username = ${user}`;
        }
      }
    }
    return { user, saferSite, userSites };
  } catch (e) {
    console.error("error in updateShotSchema: ", e);
    return { error: "Couldn't create  ShotSchema. " + e.error || "" };
  }
}

export async function updateUserSites({ safeSD, user, del, re }) {
  try {
    //Needs fixing: range is now obsolete (using R2 buckets);
    //Merges safeSD with existing data if any: invalid safeSD props in upd/re used as del indicator (just range)

    const { cron, site, range } = safeSD;

    if (del) {
      await db`update private.users set sites = array(select s from unnest(sites) as s where s ->> 'site' != ${site} ) where username = ${user}`;
      const uSite = JSON.stringify({ site, cron });
      console.log(`in updateUserSites. Removed site: ${uSite}`);
      return { error: null };
    }

    const { canAddSite, ...rest } = await getActiveSites(user);
    const { userSites } = rest;

    const thisSite = userSites?.find((s) => s.site == site);

    if (thisSite?.active) {
      console.log("Tried adding an active site");
      return { error: null };
    }

    //can upd range in both re and upd so set safeRange regardless; sR = 'invalid value' indicates to del range
    let sR = await safeRange(range);

    const newR = sR?.start != range?.start && sR?.end != range.end; //there's invalid sR

    //when not changing range, or cron or reactivating site (does not allow changing site)
    if (!newR && cron == thisSite.cron && !re) {
      const msg = "No change to existing cronData. Did not update.";
      console.log("In updateUserSites: ", msg, { site, cron });
      return { error: null };
    }

    const updSite = {
      site,
      ...(re ? thisSite : {}),
      ...(cron && cron != thisSite.cron ? { cron } : {}),
      ...(range && !sR ? { range: null } : {}), //set to null when range invalid, else default to thisSite.range
      ...(range && sR ? { range } : {}), //upd range when passed, else default
      ...(canAddSite && (!thisSite || re) ? { active: true } : {}), //only set active:true when it's a new site or reactivating
    };

    await db`update private.users set sites = array( select (case when s->>'site' = ${site} then ${updSite} else s end) from unnest(sites) as s ) where username = ${user}`;

    console.log("in updateUserSites. User's siteData has been changed.");
    if (!canAddSite) throw { error: "Max crons reached" };
    return { error: null };
  } catch (e) {
    console.error("Error in updateUserSites: ", e);
    return { error: "Couldn't update user sites: " + e.error || "" };
  }
}

export async function updateCronTable({ safeSD, user, del }) {
  //Tb structure: cron: string, cronData: {cron, user, range}[]; safeSD: {cron, site, range}[];
  //canAddCron: checks max app crons is not reahed -- 5 right now; Returns {delWorker: true} indicates to run del in updWorker().

  //Retroactively deletes inactive user crons per invocation (not an immediate delete);
  //if on sign, Call after updateUserSites, as that potentially throws errors (user's maxCron), which this depends on.

  try {
    const { cron, site, range } = safeSD;
    const cronData = { user, site, ...(range ? { range } : {}) };

    const r1 = await db`select count(cron) from private.crons`;
    const cronCount = r1?.[0]?.count;

    //check app crons;
    if (!cronCount) {
      if (del) throw { error: "No crons found to delete!" };

      console.log("in updateCronTable. No crons found. Inserting first cron");
      await db`insert into private.crons (cron, "cronData") values (${cron}, array[${cronData}::jsonb)]`;

      return { delWorker: false, updWorker: true };
    }

    //app crons > 1; Check for existing cron
    const r2 = await db`select cron from private.crons where cron = ${cron}`;
    const sameCron = r2?.[0]?.cron;

    const r3 = await db`select "maxCrons" from private.settings where id = 1`;

    const canAddCron = cronCount < (r3?.[0]?.maxCrons || 5); //for new crons;

    if (!sameCron) {
      //cron is new
      if (del) throw { error: "Cron does not exist!" };

      //new or reactivating site can't get cron schedule, so must set site inactive
      if (!canAddCron) throw { error: "App maxCrons reached." };

      await db`insert into private.crons (cron, "cronData") values (${cron}, array[${cronData}::jsonb)]`;
      return { updWorker: true };
    } else if (del) {
      //deleting an existing cron
      const r4 =
        await db`update private.crons set "cronData" = array(select c from unnest("cronData") as c where not (c ->> 'site' = ${site} and c ->> 'user' = ${user})) where cron = ${cron} returning "cronData"`;
      const r4a = r4?.[0]?.cronData;

      if (!r4a?.length || (r4a.length == 1 && !r4a[0])) {
        //no sites in schedule;
        await db`delete from private.crons where cron = ${cron}`;
        return { delWorker: true };
      }
    } else {
      //sameCron && !del: Check if user's site is in schedule else add.
      await db`update private.crons set "cronData" = case when exists (select 1 from unnest("cronData") as c where c ->> 'site' = ${site} and c ->> 'user' = ${user}) then "cronData" else array_append( "cronData", ${cronData}::jsonb ) end where cron = ${cron}`;
    }

    return { delWorker: false, updWorker: false };
  } catch (e) {
    //if adding cron (!del): set userSite.inactive; del presumes userSites().del has already run
    const e0 = "In updateCronTable. Couldn't add cron to table.";
    const e1 = !del
      ? e0 + "Setting site to inactive"
      : "Trouble deleting cron!";

    const log = `${e1} ${JSON.stringify({ user, error: e })}`;
    console.error(log);

    if (!del) await setSiteInactive(safeSD);
    return { error: e0 + (e.error || "") };
  }
}

export async function updateWorker({ safeSD, user, del }) {
  try {
    //in future can do better schedule organisation: selecting high order schedules and probing db for intersecting crons; -- can take any cron check cron list for matching pattern eg a cron for /30mins and preexisting /10mins can share execute
    const { cron, site } = safeSD;

    const workerAPI = process.env.WEBWORKER_API;
    const workerKey = process.env.WEBWORKER_KEY;
    console.log("in UpdateWorker. ", { workerAPI, workerKey });
    if (!workerKey || !workerAPI) throw { error: "env vars not found!" };

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${workerKey}`,
    };

    const r1 = await fetch(workerAPI + "/schedules", {
      headers,
    });
    const worker = await r1?.json();

    if (!r1.ok) {
      const error = "ShooterWorker API fetch failed: ";
      throw { error, load: worker?.error };
    }

    console.log("ShooterWorker API fetch success: ", { cron, worker });
    const prevCrons = worker.result?.schedules || []; //{cron: "* * *"}[]
    const thisCron = prevCrons.find((s) => s?.cron == cron);

    let updCrons = null;

    //cron schedule exists
    if (thisCron) {
      if (!del) {
        console.error("Tried adding an existing cron!");
        return { error: null };
      }
      updCrons = prevCrons.filter((s) => s.cron != cron);
    } else {
      //is new cron
      if (del) {
        console.error("Tried deleting nonexisting cron!");
        return { error: null };
      }

      //Checking maxCrons limit before inserting cron -- should be safe after updateCronSites (only context where I'm adding crons) -- still check.
      //wrong -- should check worker crons length instead. as true indication of worker cron limit.
      const workerCrons = worker.result?.schedules?.length;
      if (workerCrons >= 5) throw { error: "worker maxCrons reached." };

      updCrons = [...prevCrons, { cron }];
    }

    const r3 = await fetch(workerAPI + "/schedules", {
      method: "PUT",
      headers,
      body: JSON.stringify(updCrons),
    });

    const r3a = await r3?.json();
    if (!r3.ok) throw { error: "ShooterWorker PUT failed", load: r3a?.errors };

    console.log("in updateWorker. added new cron to existing crons. ");
    return { error: null };
  } catch (e) {
    const e0 = "Error updating worker. ";
    const e1 =
      e0 + !del ? "Will set site inactive and remove from cronTable" : "";
    const msg = `${e1} user: '${user}', error: '${error}'`;
    setNotification({ msgData: { msg }, logError: true });
    console.error(msg);

    if (!del) {
      await updateCronTable({ safeSD, user, del: true });
      await setSiteInactive(safeSD);
    }

    return { error: e0 + e.error || "" };
  }
}

//-------------------------------------------------------------------------------> client actions

// /**
//  * @typedef {Object} file
//  * @property {string} fileName
//  * @property {string} fileData
//  * @property {string} fileType
//  */
// /**
//  * @typedef {Object} shot
//  * @property {string} html
//  * @property {file} file
//  * @property {Date} date
//  * @property {number} id
//  * @property {boolean} viewed
//  */
/**
 * @param {{site: string, user: string, id: number, next?:boolean}} shotSet
 * @returns {Promise<{error: string, nextCursor: number, prevCursor:
 * number, noMoreNext: boolean, noMorePrev: boolean, shotsData: shotData[]}>}
 */

export async function getUserShots(shotSet) {
  //gets shot & html keys
  //noMoreNext/Prev: returns true when the retrieved set is less than the limit.
  // id: indicates the current position; next: indicates fetch forward direction.
  try {
    const { site, next: n, user, id: id0 } = shotSet;
    let id = id0;

    const r1 =
      await db`select sites from private.users where username = ${user} `;
    const sites = r1?.[0]?.sites;

    if (!sites.length) throw { error: "User has no sites" };

    const saferSite = safeSite(site, "noDots");
    const sS = safeSite(site);
    const hC = db(`${saferSite}_html_key`);
    const sC = db(`${saferSite}_shot_key`);
    const u = db(user);

    const thisSite = sites?.find((s) => s.site == sS);
    if (!thisSite)
      throw {
        message: `Site not found. safeSite: ${sS}, sites: ${JSON.stringify(sites)} `,
      };

    //When no id is passed (at initial fetch) assign the last stored viewedId to id
    if (!id) {
      const r2 = //jsonb_array_elements(viewedId: column)
        await db`select v ->> 'viewedId' as "lastViewedId" from private.users cross join lateral jsonb_array_elements("viewedId") as v where username = ${user} and v ->> 'site' = ${sS}`;
      id = r2?.[0]?.lastViewedId || 1;
    }

    //Get user shot data from user's table; where sC is not null filters array off deleted shots
    const clause = db`id ${n || (!n && !id0) ? db`>` : db`<`} ${id}`;
    let shotsData =
      await db`select id, ${hC} as "htmlKey", ${sC} as "shotKey", shot_url as "shotUrl", html_url as "htmlUrl", date, viewed, key_expires as expires from public.${u} where ${sC} is not null and ${clause} order by id asc limit 20`;

    if (!shotsData[0]) throw { error: "No rows in user table!" };

    //fill expUrlKeys with keys whose 'expired' column is dated beyond last 7 days;
    const expKeys = shotsData
      .filter((s) => new Date(s?.expires) < new Date())
      .map((s) => ({ shotKey: s.shotKey, htmlKey: s.htmlKey }));

    if (expKeys?.length) {
      const expiresIn = new Date(Date.now() + 3600 * 24 * 7);
      const { signedUrls, error } = await getSignedUrls(expKeys);

      if (error || !signedUrls?.length)
        throw { error: error || "Could not get new signed urls!" };

      //normalize shotsData array to include new signedUrls
      shotsData = shotsData.map((shot) => {
        //if sU then new signedUrl for entry, updates;
        const sU = signedUrls.find((sU) => sU.shotKey == shot.shotKey);
        return { ...shot, ...(sU ? sU : {}) };
      });

      //Update table with new signedUrls;
      const r4 =
        //jsonb_array_elem() helps parse signedUrls for use in sql statement; signedUrls is cast to jsonb but is jsonb[]; Does this work?
        await db`update ${u} set shot_url = sU ->> 'shotUrl', html_url = sU ->> 'htmlUrl', key_expires = ${expiresIn} from jsonb_array_elements(${signedUrls}::jsonb) as sU where ${sC} = sU ->> 'shotKey'`;
    }

    const viewIds = shotsData.map((s) => s.id);
    const nextCursor = viewIds.at(-1);
    const prevCursor = viewIds.at(0);
    const noMoreNext = !!next && viewIds.length < 20;
    const noMorePrev = !next && viewIds.length < 20;

    return { nextCursor, prevCursor, noMoreNext, noMorePrev, shotsData };
  } catch (e) {
    console.error("Error in getUserShots: ", e);
    return { error: "Couldn't get userShots " + e.error || "" };
  }
}

/**
 * @param {{site: string, id: number, next?:boolean}} shotSet
 * @returns {Promise<{error: string, nextCursor: number, prevCursor:
 * number, noMoreNext: boolean, noMorePrev: boolean, shotsData:shotData[]}>}
 */

export async function getVisitorShots(shotSet) {
  //check if VSITE, VTB vars are set
  try {
    const { id, next: n } = shotSet;

    const saferSite = safeSite(process.env.VSITE, "noDots");
    const vShotCol = db(`${saferSite}_shot_key`);
    const vHtmlCol = db(`${saferSite}_html_key`);
    const vtb = db(process.env.VTB);

    //where clause construction: get next/prev shotsData when id, else retrieve the 20 most recent rows (initial fetch);
    const clause = db`${id ? db`and id ${n ? db`>` : db`<`} ${id} order by id asc` : db`order by id desc`}`;

    //where vShotCol is not null filters out deleted shots;
    let shotsData =
      await db`select id, ${vShotCol} as "shotKey", shot_url as "shotUrl", ${vHtmlCol} as "htmlKey", html_url as "htmlUrl", date, viewed, key_expires as expires from public.${vtb} where ${vShotCol} is not null ${clause} limit 20 `;

    if (!shotsData[0]) throw { error: "Visitor table returned no rows!" };
    if (!id) shotsData.reverse(); //when !id, shotData is fetched reversed in desc order; this normalises it;

    //expKeys contains keys whose signed url, 'key_expires' column set to 7 days, has elapsed;
    const expKeys = shotsData
      .filter((s) => new Date(s?.expires) < new Date())
      .map((s) => ({ shotKey: s.shotKey, htmlKey: s.htmlKey }));

    //If one or more signed urls have expired
    if (expKeys?.length) {
      const expiresIn = new Date(Date.now() + 3600 * 24 * 7);

      const { error, signedUrls } = await getSignedUrls(expKeys);
      if (error || !signedUrls?.length)
        throw { error: error || "Could not get new signed urls!" };

      //update table with new signedUrls;
      const r4 =
        await db`update ${vtb} set shot_url = sU ->> 'shotUrl', html_url = sU->> 'htmlUrl', key_expires = ${expiresIn} from jsonb_array_elements(${signedUrls}::jsonb) as sU where ${vShotCol} = sU ->> 'shotKey'`;

      //normalize new signed urls to shotsData array;
      shotsData = shotsData.map((shot) => {
        const sU = signedUrls.find((sU) => sU.shotKey == shot.shotKey);
        return { ...shot, ...(sU ? sU : {}) };
      });
    }

    //viewedIds would filter out deleted shots which have key_expires (expires) as null, but that is redundant since it is filtered in shotsData.
    const viewIds = shotsData.filter((s) => s.expires).map((s) => s.id);
    const nextCursor = viewIds.at(-1);
    const prevCursor = viewIds.at(0);
    const noMoreNext = !!next && viewIds.length < 20;
    const noMorePrev = !next && viewIds.length < 20;

    return { nextCursor, prevCursor, noMoreNext, noMorePrev, shotsData };
  } catch (e) {
    console.error("Error in getVisitorShots. ", e);
    return { error: "Couldn't get visitor keys. " + e.error || "" };
  }
}

//create separate getHtml() function.
//Unneeded -- Blobable shotUrls exist in shotData.
/**
 * @param {{site?: string, user?: string, downloadProps: downloadProps}}
 * @returns {Promise<{error?: string, dShotData: Omit<shotData, "viewed">[]}>}
 */
export async function getDownloadShotKeys({ site, user, downloadProps }) {
  //can pass timePeriod, cursor, viewed, else all; Or combos
  //does not limit results but that is unnecessary for low cost strings tx

  try {
    const u = user && site ? true : false; //check user is logged and has scheduled a shot
    const { timePeriod, cursor, unviewed } = downloadProps;

    //check timeperiod is present else !t1
    const t1 = isDate(timePeriod?.from) ? timePeriod.from : null;
    const t2 = isDate(timePeriod?.to) ? timePeriod.to : new Date();

    //alternatively get id cursor
    const { id, next } = cursor || {};

    //clause conditionally selecting timePeriod, cursor, or unvieweds -- or combos
    let clause = db``;
    if (id) clause = db`and id ${next ? db`>` : db`<`} ${id}`;
    if (unviewed) clause = db`${clause} and viewed = false`;
    if (t1) clause = db`${clause} and date > ${t1} and date < ${t2}`;

    const saferSite = safeSite(u ? site : process.env.VSITE, "noDots");
    const htmlCol = db(saferSite + "_html_key");
    const shotCol = db(saferSite + "_shot_key");
    const tb = db(u ? user : process.env.VTB);

    let dShotData =
      await db`select id, ${shotCol} as "shotKey", shot_url as "shotUrl", html_url as "htmlUrl", ${htmlCol} as "htmlKey", date from public.${tb} where ${shotCol} is not null ${clause}`; //send a cursor of last id if using limit
    if (!dShotData[0]) throw { error: "No rows in user's table!" };

    return { dShotData };
  } catch (e) {
    console.error("In getDownloadShotKeys: ", e);
    return {
      error: `Error in getDownloadShotKeys: ${e.error || " Could not get shotKeys!"}`,
    };
  }
}

/**
 * @param {{htmlKey: string, shotKey: string}[]} keys
 * @returns {Promise<{error?: string, signedUrls?: {shotUrl:string, shotKey:string, htmlUrl: string}[]}>}
 */
async function getSignedUrls(keys) {
  //Gets html and shot presignedUrls from Worker; res.json(): {htmlUrl, shotUrl, shotKey}[];

  try {
    if (!keys.length) throw { error: "keys (shotKeys) array is empty!" };

    const shooterAPI = process.env.WEBWORKER_URL + "?getUrls=true";
    const Authorization = await createJWT();
    const headers = { Authorization, "Content-Type": "application/json" };
    const options = {
      headers,
      method: "POST",
      body: JSON.stringify(keys),
    };

    const res = await fetch(shooterAPI, options);

    if (!res.ok)
      throw (
        (await res?.json()?.error) || (await res?.json()) || (await res?.text())
      );

    return { signedUrls: await res.json() };
  } catch (e) {
    console.error("Error in getSignedUrl: ", e);
    return { error: "Error getting getSignedUrls: " + e || "" };
  }
}

//Deprecated -- shots fetched directly from presignedUrl;
// /**
//  * @returns {Promise<{shotBlob: Blob, error: string}>}
//  */
// export async function getDownloadShot(key) {
//   try {
//     //Call in a loop -- Refrieves one shot per call (to fit vercel 4.5mb payload cap)
//     if (!key.trim()) throw { error: "Missing shotkeys!" };

//     const shooterAPI = `${process.env.WEBWORKER_URL}?getShot=true`;
//     const Authorization = await createJWT();
//     const headers = { Authorization, "Content-Type": "application/json" };
//     const options = { headers, method: "POST", body: JSON.stringify({ key }) };

//     const shot = await fetch(shooterAPI, options);

//     if (!shot.ok) throw { error: "Could not get shot binary for " + key };

//     const shotBlob = await shot.blob();

//     return { shotBlob };
//   } catch (e) {
//     console.error("Error in getDownloadShot", e);
//     return { error: "Error in getDownloadShot: " + e.error };
//   }
// }

//Deprecated: Can download from presignedURL;
// export async function getHtml(key) {
//   try {
//     const shooterAPI = `${process.env.WEBWORKER_URL}?getHtml=true`;
//     const Authorization = await createJWT();
//     const headers = { Authorization, "Content-Type": "application/json" };
//     const options = { headers, method: "POST", body: JSON.stringify({ key }) };

//     const html = await fetch(shooterAPI, options);

//     if (!html.ok) throw { error: "Could not get html for " + key };

//     return { html: await html.blob() };
//   } catch (e) {
//     console.log(e);
//     return { error: "Error in getHtml: " + e.error };
//   }
// }

export async function deleteShot({ ids, user, site }) {
  //can send an array of shot IDs
  try {
    if (!ids?.length || !site || !user) throw { error: "Missing Params" };

    !Array.isArray(ids) && (ids = [ids]);
    const u = db(user);
    const htmlCol = db(safeSite(site, "_html_key"));
    const shotCol = db(safeSite(site, "_shot_key"));

    const r1 =
      //SQL ok?
      await db`delete from public.${u} where id = any(${ids}) returning ${shotCol}`;

    if (!r1?.length)
      throw { error: "No deletions returned from sql, ids: " + ids };

    //update usermeta to include deleted shot count
    await db`update private.usermeta set total_shots = total_shots + ${r1.length} where username = ${user}`;

    const shotKeysArr = r1.map((s) => s[shotCol]);

    const { error } = await deleteR2Shot(shotKeysArr);
    if (error) throw { error: "Could not delete shot" };

    return { error: null };
  } catch (e) {
    console.error("Error in deleteShot: ", e);
    return { error: `Could not delete shot: ${e.error}` };
  }
}

export async function setShotViewed({ site, ids, user }) {
  //call from frontend when user opens unviewed images
  // sets viewed in user's table to true: ids: [] -- will call per opened shot or selectedShots.

  try {
    if (!user || !site || !ids) throw { error: "Missing parameters" };

    !Array.isArray(ids) && (ids = [ids]);

    const u = db(user);
    const sS = safeSite(site);
    const shotCol = db(`${safeSite(site, "_")}_shot_key`);

    await db`update public.${u} set viewed = true where ${shotCol} is not null and id = any(${ids})`;

    //Store current viewedId with site filter applied to the existing viewedId array.
    await db`update private.users set "viewedId" = array_append(array(select v from unnest("viewedId") as v where v->>'site' is not null and v->> 'site' != ${sS}), jsonb_build_object('site', ${sS}, "viewedId", ${ids.at(-1)}) ) where username = ${user}`;
    return { error: null };
  } catch (e) {
    console.error("error in setEntryViewed: ", e);
    return { error: "couldn't setEntryViewed: " + e.error || "" };
  }
}

/**
 * @param {*} user
 * @returns {Promise<{allSitesUnvieweds?: unviewedType[], error?: string}>}
 */
export async function getUnviewedShotIds(user) {
  //unviewed: {site, count}
  //Gets the number of unopened keys per site
  try {
    const { tableName, userSites } = await getUserSites({ user });
    if (!userSites) throw { error: "User has no sites" };
    const u = db(tableName);

    const allSitesUnvieweds0 = userSites.map(async (s) => {
      const shotCol = db(`${safeSite(s.site, "noDots")}_shot_key`);
      try {
        const uv =
          await db`select id from public.${u} where ${shotCol} is not null and viewed = false::boolean`;
        const unvieweds = uv.map((uv) => uv.id); //gets unviewed ids;
        return { site: s.site, unvieweds };
      } catch (e) {
        console.error("Error in getUnviewedShotIds > userSites.map: ", e);
        return { site: s.site, unvieweds: [] };
      }
    });

    const allSitesUnvieweds = await Promise.all(allSitesUnvieweds0);
    return { allSitesUnvieweds };
  } catch (e) {
    console.error("Error in getUnviewedShotIds. ", e);
    return { error: "Could not get unviewed keys. " + e.error || "" };
  }
}

/**
 * @param {string} user
 * @returns {Promise<{crons:Array<{cron: string}>, error?:string}>}
 */
export async function getCrons() {
  // Gets list of available cron schedules; can handle empty crons in frontend -- no need for '!res' throw
  try {
    const crons = db`select cron from private.crons`;
    return { crons };
  } catch (e) {
    console.error("Error in getCrons", e);
    return { error: "Error in getCrons: " + e.error };
  }
}

//-------> User control

export async function checkUser({ username, password }) {
  //uid is defined only when the pass is matched
  try {
    if (!username) throw { error: "Missing credentials" };
    const r =
      await db`select username as user, password as pass, uuid, s."sessionId" as "sid" from private.users u left join private.sessions s on u.uuid = s.uuid where username = ${username}`;
    if (!r.length) throw { error: "User does not exist" };

    const samePass = await bcrypt.compare(password, r[0].pass);
    if (samePass) return { user: r[0].user, sid: r[0].sid, uid: r[0].uuid };
    else return { user: r[0].user };
  } catch (e) {
    console.error("Error in checkUser: ", e);
    return { error: e.error || "Couldn't confirm user." };
  }
}

export async function createUser({ userPass, safeSD }) {
  //creates a record for new user in user table, optionally adding cron schedule (safeSD) if included.
  try {
    const { username, password } = userPass;
    if (!username || !password) throw { error: "Missing parameters" };

    const { user } = await checkUser({ username, password });
    if (user) throw { error: "User Exists! Sign in instead." };

    const cookie = await createCookie();
    const token = await getToken(cookie);
    const uuid = v4();
    const safePass = await bcrypt.hash(password, 11);

    safeSD && (safeSD = { ...safeSD, active: true });

    const sCol = safeSD ? db`, sites` : db``;
    const sVal = safeSD ? db`, array[${safeSD}::jsonb]` : db``;

    await db`insert into private.users (username, password, uuid ${sCol}) values (${username}, ${safePass}, ${uuid} ${sVal} )`;
    await db`insert into private.sessions (uuid, "sessionId") values (${uuid}, ${token})`;

    return { cookie, safeSD };
  } catch (e) {
    console.error("Error in createUser: ", e);
    return { error: "Couldn't create user. " + e.error || "" };
  }
}

export async function deleteUser(user, delPass) {
  //verify password in top module;
  try {
    let delReady = false;
    let deletionDue;

    if (!delPass) {
      const nextMonth = new Date(Date.now() + 28 * 24 * 3600 * 1000);
      // await db`update private.users set "deletionAttempt" = (case when "deletionAttempt" is not null then "deletionAttempt" else ${nextMonth} end) where username = ${user} returning "deletionAttempt"`;
      const msg = `An attempt at deleting your account was made, and this will be possible on \'${nextMonth.toLocaleString()}\' with or without your password. To prevent this, simply delete this notification or uncheck \"Delete Account anyway\" in profile.`;

      const r1 =
        await db`update private.users set "deletionAttempt" = (case when "deletionAttempt" ->> 'message' is not null then "deletionAttempt" else jsonb_build_object('deletionDue', ${nextMonth}, 'message', ${msg} ) end) where username = ${user} returning "deletionAttempt"`;
      deletionDue = r1?.[0]?.deletionAttempt?.deletionDue;
      if (new Date(deletionDue) < new Date()) delReady = true;
    }

    if (delPass || delReady) {
      //Store usage data on user deletion
      const c = await db`select count(*) from public.${db(user)}`;
      await db`update private.usermeta m set joined_on = u.created, deleted_on = now(), total_shots = total_shots + ${c?.[0]?.count || 0} from (select * from private.users where username = ${user}) as u where m.username = ${user}`;

      await db`delete from private.users where username = ${user}`;
      await db`drop table public.${db(user)}`;
      return { deletionDue, deleted: true };
    }

    return { deletionDue, deleted: false };
  } catch (e) {
    console.error("Error in deleteUser: ", e);
    return { error: "Couldn't delete user." };
  }
}

export async function cancelDeleteUser(user) {
  try {
    const r1 =
      await db`update private.users set "deletionAttempt" = null where username = ${user}`;
    return { error: null };
  } catch (e) {
    console.error("Trouble canceling 'delete account' action", e);
    return { error: "Trouble canceling 'delete account'!" };
  }
}

/**
 * @param {*} param0
 * @typedef {{site:string, cron:string, range:{start:number, end:number}, active: boolean}} userSite
 * @returns {Promise<{tableName?: string, userSites?: userSite[], maxCrons?: number, error?: string}>}
 */
export async function getUserSites({ user }) {
  //userSites: {site, cron, range}[]
  try {
    if (!db) throw { error: "Db uninitialised!" };
    if (!user) throw { error: "Unknown user!" };

    const r1 =
      await db`select table_name as t from information_schema.tables where table_schema = 'public' and table_name = ${user}`;

    const r2 =
      await db`select sites, "maxCrons" from private.users where username = ${user}`;

    if (!r1?.[0]?.t) throw { error: "Could not get user table!" };
    if (!r2?.[0]?.sites) throw { error: "User has no sites!" };

    const siteData = { tableName: r1[0].t, userSites: r2[0].sites };
    return { ...siteData, maxCrons: r2[0].maxCrons };
  } catch (e) {
    console.error(`Error in getUserSites: `, e);
    return { error: `Error in getUserSites: ${e.error}` };
  }
}

export async function getActiveSites(user) {
  //for this, set active: true on all new site/cron addition and false on stale or deactivation
  try {
    const { userSites, maxCrons, error } = await getUserSites({ user });
    if (!maxCrons) throw { error: 'User "maxCrons" missing.' };
    if (error) throw error;

    const activeSites = userSites?.filter((s) => s.active == true);
    const canAddSite = activeSites < maxCrons;

    return { canAddSite, maxCrons, activeSites, userSites };
  } catch (e) {
    console.error("in getActiveSites: ", e);
    return { canAddSite: false, error: e.error || "Cannot add site!" };
  }
}

export async function setSiteInactive({ site, cron, user }) {
  //sets site in users to inactive and deletes all rows from user table;
  try {
    if (!site || !cron || !user) throw { error: "Missing parameters" };
    if (!db) throw { error: "Db uninitialized!" };

    const sCol = safeSite(site, "noDots");

    const r2 =
      await db`update private.users set sites = array( select (case when s ->> 'site' = ${site} and s ->> 'cron' = ${cron} then jsonb_set(s, '{active}', 'false'::jsonb ) else s end ) from unnest(sites) as s ) where username = ${user}`;

    //Rather not delete all shots on inactive -- user may reset as active and resume schedule;
    // const r3 = await db`delete from public.${db(user)} where ${sCol} is not null`;
    return { error: null };
  } catch (e) {
    console.error("In setSiteInactive: ", e);
    return { error: "Couldn't set site inactive." };
  }
}

/**
 * @typedef {{id?:number, date?:Date, msg:string, danger?:boolean}} msgData
 * @param {{msgData: msgData, user?:string | string[], del?:boolean, logError?:boolean }} msgData
 * @returns {Promise<{id: number, error: string}>}
 */
export async function setNotification({ msgData, user, del, logError }) {
  //need to set structure for object errors

  //msgData: {id?, date?. msg, danger};
  //sets notification enmass for users (user[]) or just 1 (user); sets to 'errorLog: {user, cron, error}' when 'logError = true';
  //used in setNotifyEntry: called once on getting ready users, and then later for each user when shot added.
  //uses same id even for an array of users -- non unique ids shouldn't pose security problems.

  try {
    if (!db) throw { error: "Db uninitialised" };

    function ID() {
      return Math.floor(Math.random() * 1000000);
    }

    const { id: i, date: d, msg, danger } = msgData;

    //logError msg can be object
    const message = typeof msg == "string" ? msg.trim() : msg;

    if (!message && !del) throw { error: "Message missing in delete request!" };
    if (del && !i) throw { error: "ID missing in delete request!" };

    const u = Array.isArray(user) ? user : [user];
    const id = i || ID();
    const date = d || new Date();
    const noti = { id, date, message, danger };

    if (!del) {
      u[0] &&
        (await db`update private.users set notifications = array_append(notifications, ${noti}::jsonb ) where username = any(${u})`);
      logError &&
        (await db`insert into private."errorLogs" (error, e_id) values (${{ date, message }}, ${id})`);
    } else {
      u[0] &&
        (await db`update private.users set notifications = array(select n from unnest(notifications) as n where n ->> 'e_id' != ${id}) where username = any(${u})`);
      logError &&
        (await db` delete from private."errorLogs" where e_id = ${id} `);
    }

    return { id };
  } catch (e) {
    console.error("Error in notifyEntry: ", e);
    return {
      error: "Could not set or delete notification. " + e?.error || "",
    };
  }
}

//------------ User session
export async function createSession(password, username, expires) {
  //call after validateSession -- which checks that a session is not active.
  try {
    if (!password || !username) throw { error: "Missing credentials" };

    const { uid } = await checkUser({ username, password });
    if (!uid) throw { error: "Wrong Username or Password!" };

    const cookie = await createCookie();
    const token = await getToken(cookie);
    await db`update private.sessions s set "sessionId" = ${token}, expires = ${expires} from private.users u where s.uuid = u.uuid and s.uuid = ${uid} returning u.username`;

    //can set fingerprint ID -- nope, handled elsewhere;

    return { cookie, user: r1?.[0]?.username };
  } catch (e) {
    console.error("Error in createSession: ", e);
    return { error: e?.error || "Couldn't create session!" };
  }
}

/**
 * @param {{token: string, expires?: Date }} args
 * @returns {Promise<{ user: string, uid: string, joined: string, error?: string, isAdmin: isAdmin }>}
 */
export async function getSession({ token, expires }) {
  //scrap isAdmin -- will need to do db check before retrieving sensitive info, so must get admin status in function -- same thing -- I can get from validateSession in said function.
  //Call with expires to update lastLog else it retrieves session. if (expires): absence of error indicates success;
  try {
    if (!token) throw { error: "No Cookie Token" };

    let r;

    if (!expires) {
      r =
        await db`select u.username as user, u.uuid, u."isAdmin", u.created as joined, expires from private.sessions s inner join private.users u on s.uuid = u.uuid where s."sessionId" = ${token}`;

      if (!r?.[0]) throw { error: "Unknown user" };
      if (new Date() > new Date(r[0].expires))
        throw { error: "Session expired!" };

      console.log("in getSession. Valid user: ", r);
    } else {
      await db`update private.sessions set "lastLog" = now(), expires = ${expires} where "sessionId" = ${token}`;
    }

    const A = r[0].isAdmin;
    const isAdmin =
      A == 1 ? "Bronze" : A == 2 ? "Silver" : A == 3 ? "Gold" : null;

    const r1 = { joined: r[0].joined, isAdmin };
    return { user: r[0].user, uid: r[0].uuid, ...r1 };
  } catch (e) {
    console.error("Error in validateSession: ", e);
    return { error: "Trouble validating user! " + e.error || "" };
  }
}

export async function deleteSession(token) {
  try {
    if (!token) throw { error: "Empty token string" };

    await db`update private.sessions set "sessionId" = null where "sessionId" = ${token}`;
    return { error: null };
  } catch (e) {
    console.error("in deleteSession. Error: ", e);
    return { error: "Something went wrong!" };
  }
}
