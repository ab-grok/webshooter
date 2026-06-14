//src/app/api/getCronSites/route.ts

import { NextResponse } from "next/server";
import * as jose from "jose";
import { getCronSites, setNotification } from "@/lib/server";

export async function GET(req: Request) {
  try {
    const token = req.headers.get("Authorization")!;
    const secret = new TextEncoder().encode(process?.env?.JWT_SECRET);

    const { payload } = await jose.jwtVerify(token, secret);
    const { cron } = payload;

    const { error: e, readySites, id } = await getCronSites(cron);
    if (e) throw { error: e };

    return NextResponse.json({ readySites, id });
  } catch (e: any) {
    console.error("Error in api: ", e);

    const msg = `Could not get readySites. ${JSON.stringify(e?.error || e?.message || e)}`;
    const msgData = { msg, danger: true };
    await setNotification({ msgData, logError: true });
    return NextResponse.json({ error: "An error occured" }, { status: 401 });
  }
}
