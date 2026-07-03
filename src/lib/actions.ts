"use server";

import { cookies } from "next/headers";
import {
  createSession,
  createUser,
  deleteSession,
  updateShotSchema,
  updateUserSites,
  updateWorker,
  updateCronTable,
  checkUser,
  deleteUser,
  setSiteInactive,
  cancelDeleteUser,
  getSession,
  getUserShots,
  getVisitorShots,
  getUserSites,
  setShotViewed,
  getUnviewedShotIds,
  deleteShot,
  getDownloadShotKeys,
  getCrons,
  getActiveSites,
} from "./server";
import { delAccountRate, logRate, sessionRate } from "./redis.js";
import {
  encodeBase32LowerCaseNoPadding,
  encodeHexLowerCase,
} from "@oslojs/encoding";
import { sha256 } from "@oslojs/crypto/sha2";
import { downloadProps, range, userData } from "./types";
import * as jose from "jose";
import { safeCron, safeRange, safeSite } from "./utils";

//---> session managment
export async function getCookie(name: "session" | "analytics") {
  const cookie = (await cookies())?.get(name)?.value;
  return cookie;
}

async function setCookie({ name, cookie, expires }: setCookieProp) {
  try {
    (await cookies()).set(name, cookie, {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      expires: expires || new Date(Date.now() + 3600000 * 24 * 28),
    });
    return { error: null };
  } catch (e) {
    console.error("Error in setCookie. ", e);
    return { error: "Error setting cookie" };
  }
}

async function deleteCookie(name: "session" | "analytics") {
  const cookie = (await cookies()).delete(name);
}

export async function validateSession() {
  const cookie = await getCookie("session");
  if (!cookie) return { error: "Invalid session" };

  const token = (await getToken(cookie))!;

  const { user, joined, isAdmin } = await getSession({ token });
  if (!user) return { error: "Unknown user" };

  //rateLimit is used to renew cookie expiration
  const { success } = await sessionRate.limit(`user:${user}`);

  //reset's expiry date to next month every 7 days from last active
  if (success) {
    const expires = new Date(Date.now() + 24 * 28 * 3600000);

    const { error: e1 } = await getSession({ token, expires });

    if (e1) console.error({ error: e1 });
    else await setCookie({ name: "session", cookie, expires });
  }
  return { user, joined, isAdmin };
}

//--------> User Account Management
export async function logUser(username: string, password: string) {
  const expires = new Date(Date.now() + 3600000 * 24 * 28);

  const { error: e1 } = await validateSession();
  if (e1) return { error: e1 };

  const { error, ...s } = await createSession(password, username, expires);
  const { user, cookie } = s;
  if (error || !cookie) return { error };

  const { error: e2 } = await setCookie({ name: "session", cookie, expires });
  return { error: e2 };
}

export async function unLogUser() {
  const cookie = await getCookie("session");
  const token = await getToken(cookie!);

  const { error } = await deleteSession();
  await deleteCookie("session");
  return { error };
}

export async function signUser({ username, password, siteData }: signUser) {
  //validate session first -- not needed.
  const userPass = { username, password };

  const safeSD = await getSafeSD(siteData as siteData)!;

  const { cookie, error } = await createUser({ userPass, safeSD });
  if (error || !cookie) return { error };

  //update visitorFp function: update db to signed

  await setCookie({ name: "session", cookie });
  if (safeSD) {
    const { error } = await scheduleShot(safeSD);
    if (error) return { error };
  }
  return { error: null };
}

export async function getUserData(): Promise<userData> {
  // here I'll collect all the info needed to display in frontend for an active session
  // notifications: InfiniteQuery; notepad, will have own functions.
  const { user, joined, isAdmin } = await validateSession();

  if (!user) return { error: "In getUserData, Unknown user" };

  const { maxCrons, activeSites, userSites, error } = await getActiveSites();

  return { user, joined, maxCrons, activeSites, userSites, isAdmin, error };
}

export async function getNotepad(update: "update" | undefined) {}

//rate limit this fn
export async function deleteAccount(password?: string) {
  //Has two modes, with pass without pass (deletion attempt) -- which will make deleting with pass, even when an attempt is registered, its own module (but can be handled F.End?)
  //returns {deletionDue, deleted}: deletionDue -- for deletionAttempt (logged but no password); deleted: true -- when deleted
  const { error: e1, user } = await validateSession();
  if (e1) return { error: e1 };

  const { uid, error: e2 } = await checkUser({ username: user, password });
  if (e2) return { error: e2 };

  const { success, reset } = await delAccountRate.limit(`user:${user}`);
  if (!success) {
    const error = `Too many attempts, try again on ${new Date(reset).toLocaleString()}`;
    return { error };
  }

  const delPass = uid ? true : false; //uid is defined on pass match

  const { deletionDue, deleted, error: e3 } = await deleteUser(user, delPass);
  if (e3) return { error: e3 };
  //set deletion notification separate from regular notification.

  //remove cookie session
  if (deleted) await unLogUser();
  return { deleted, deletionDue };
}

export async function cancelDeleteAccount() {
  const { error: e1, user } = await validateSession();
  if (e1) return { error: e1 };

  const { error: e2 } = await cancelDeleteUser(user);
  return { error: e2 };
}

//----------> Shots management
export async function scheduleShot(safeSD: siteData) {
  //Used to set and reactivate crons.

  const { user, error: e0 } = await validateSession();
  if (e0) return { error: e0 };

  safeSD = (await getSafeSD(safeSD))!;
  if (!safeSD) return { error: "Unsafe parameters!" };

  const SDprops = { safeSD, user, del: false, re: false, ...safeSD };

  //updateShotSchema checks for false safeSD -- important
  const { saferSite, error: e1 } = await updateShotSchema(SDprops);
  if (e1) return { error: e1 };

  const { error: e2 } = await updateUserSites(SDprops);
  if (e2) return { error: e2 };

  const { error: e3, updWorker } = await updateCronTable(SDprops);
  if (e3) return { error: e3 };

  if (!updWorker) return { error: null };

  const { error: e4 } = await updateWorker(SDprops);

  return { error: e4 };
}

export async function reactivateCron(safeSD: siteData) {
  //Calls updateUserSites -> sets site to active; updateCronTable -> will then reinsert cronData or cron.
  const { error: e1, user } = await validateSession();
  if (e1) return { error: e1 };

  safeSD = (await getSafeSD(safeSD))!;
  if (!safeSD) return { error: "Unsafe parameters" };

  const reProps = { safeSD, user, del: false };

  //e2 returns error if user's maxCrons has been reached.
  const { error: e2 } = await updateUserSites({ ...reProps, re: true });
  if (e2) return { error: e2 };

  //handles userSite.inactive when maxAppCrons is reached
  const { error: e3 } = await updateCronTable({ ...reProps });
  if (e3) return { error: e3 };

  //handles cronTable.del and userSite.inactive when maxWorkerCrons is reached
  const { error: e4 } = await updateWorker({ ...reProps });

  return { error: e4 };
}

export async function deactivateCron(site: string, cron: string) {
  //pauseCron: doesn't delete site data or column but removes from cronTable
  const { user, error: e0 } = await validateSession();
  if (!user) return { error: e0 };

  const { site: sS, cron: sC } = (await getSafeSD({ site, cron }))!;

  if (!sS || !sC) return { error: "Unsafe site data!" };

  const safeSD = { site: sS, cron: sC };
  const delCronProps = { safeSD, user, del: true };

  const { error: e1 } = await setSiteInactive({ ...safeSD, user });
  if (e1) return { error: e1 };

  const { error: e2, delWorker } = await updateCronTable({ ...delCronProps });

  if (!delWorker) return { error: e2 };
  // if (e2) return { error: e2 };

  const { error: e3 } = await updateWorker({ ...delCronProps });

  return { error: e3 };
}

export async function deleteCron(safeSD: siteData) {
  //This will delete all shot records;

  const { user, error: e1 } = await validateSession();
  if (e1) return { error: e1 };

  safeSD = (await getSafeSD(safeSD))!;
  if (!safeSD) return "Unsafe parameters";

  const delProps = { safeSD, user, del: true, re: false, ...safeSD };

  const { error: e2 } = await updateShotSchema(delProps);
  if (e2) return { error: e2 };

  const { error: e3 } = await updateUserSites(delProps);
  if (e3) return { error: e3 };

  const { error: e4, delWorker: dW } = await updateCronTable(delProps);

  if (dW) {
    const { error: e5 } = await updateWorker(delProps);
    if (e5) return { error: e5 };
  }

  if (e4) return { error: e4 };
}

export async function testSite() {
  //Provides feedback of liveShot when adding schedule.
}

//---------> analytics

//--------> frontend

export async function getSites() {
  const { user } = await validateSession();

  const { userSites, error: e2 } = await getUserSites({ user });

  if (!userSites && e2) {
    const u = { cron: process?.env?.VCRON, active: true };

    return { userSites: [{ site: safeSite(process?.env?.VSITE!), ...u }] };
  }

  return { userSites };
}

export async function getShots(prop: shotProp) {
  //handle displaying new shots coming in when you're scrolling through previous shots
  //throws handled by reactQuery as reactQuery.error

  const { user, error: e1 } = await validateSession();
  if (e1) console.error({ error: e1 });

  //getUserShots when user: userSites is defined else get visitorShots;
  const { userSites, error: e2 } = await getUserSites({ user });

  if (userSites?.length) {
    const shots = await getUserShots({ ...prop, user: user! });
    return shots;
  } else {
    const shots = await getVisitorShots(prop);
    return shots;
  }
}

//Deprecated: Can fetch directly from presignedURL;
// export async function getR2Shot(shotKey: string) {
//   // gets the stored binary from R2 one shot at a time (to fit vercel 4mb serverless function limit).
//   //can always retrieve shotKeys by ID or keys; Then filter that against shots stored in useQuery -- then retrieve only unhad

//   const { shotBlob, error } = await getDownloadShot(shotKey);
//   return { shotBlob, error };
// }

// export async function getR2Html(htmlKey: string) {
//   const { html, error } = await getHtml(htmlKey);
//   return { html, error };
// }

//gets the shotKeys for downloads,

export async function getDbShotKeys({
  timePeriod, // date {from, to}
  cursor, // {id, next}
  unviewed,
  site,
}: downloadProps & { site: string }) {
  const { user } = await validateSession();
  const p = { user, site, downloadProps: { timePeriod, cursor, unviewed } };

  return await getDownloadShotKeys(p);
}

export async function getCronSchedules() {
  const { user } = await validateSession();
  if (!user) return { error: "Unknown user" };
  return await getCrons();
}

export async function delShot({ ids, site }: delShotType) {
  //deletes a single shot
  if (!ids || !site) return { error: "Missing params!" };

  const { user } = await validateSession();
  if (!user) return { error: "Unknown User!" };

  const { error } = await deleteShot({ user, ids, site });
  if (error) return { error };

  return { error: null };
}

// records viewed shots: Errors caught in reactQuery.
export async function setViewed({
  ids,
  site,
}: Omit<shotProp, "id"> & { ids: number[] }) {
  const { user } = await validateSession();
  if (!user) return { error: "Unknown user!" };

  const { error } = await setShotViewed({ ids, site, user });
  if (error) return { error };

  return { error: null };
}

export async function getUnviewedIds() {
  const { user } = await validateSession();
  if (!user) return { error: "Unknown user!" };

  const { allSitesUnvieweds, error } = await getUnviewedShotIds(user);
  if (!allSitesUnvieweds) return { error: "Could not get unvieweds" };

  return { allSitesUnvieweds };
}

//-----------> Helpers
async function getSafeSD(safeSD: siteData) {
  //for quick param validation -- safeSD consuming functions also perform safety checks

  let { site, cron, range } = safeSD;
  site = safeSite(site)!;
  cron = safeCron(cron);
  range = safeRange(range!);

  if (!site || !cron) return null;
  return { site, cron, range };
}

export async function getToken(cookie: string) {
  if (!cookie) return null;
  return encodeHexLowerCase(sha256(new TextEncoder().encode(cookie)));
}

//alter consuming files in server.js
export async function createCookie() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return encodeBase32LowerCaseNoPadding(bytes);
}

export async function createJWT() {
  //gets Uint8Array binary of secret
  const secret = new TextEncoder().encode(process?.env?.JWT_SECRET);

  return await new jose.SignJWT({ safe: "true" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt() //this doesn't seem integral -- can remove?
    .setExpirationTime("1m")
    .sign(secret);
}

//--------> types
type signUser = {
  username: string;
  password: string;
  visitorFp?: string;
  siteData?: siteData;
};

export type siteData = {
  site: string;
  cron: string;
  range?: range;
  reactivate?: boolean;
};

export type shotProp = {
  site: string;
  id: number;
  next?: boolean;
};

type setCookieProp = {
  name: "session" | "analytics";
  cookie: string;
  expires?: Date;
};

type delShotType = {
  site: string;
  ids: number | number[];
};
