//src/app/api/makeEntry/route.ts

import { makeEntry, setNotification } from "@/lib/server";
import * as jose from "jose";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const token = req.headers.get("Authorization")!;
    const secret = new TextEncoder().encode(process?.env?.JWT_SECRET);

    const { payload } = await jose.jwtVerify(token, secret);

    const shotData = await req.json();
    if (!shotData.user || !shotData.site) throw "Missing shotData params!";

    //shotData : {htmlKey, shotKey, user, site, range, id}
    const { error } = await makeEntry(shotData);
    if (error) throw { error };
  } catch (e: any) {
    const msg = `Error in makeEntry API: ${JSON.stringify(e?.error || e?.message || e)}`;

    const msgData = { msg, danger: true };
    await setNotification({ msgData, logError: true });
  }
}
