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
    if (typeof cron !== "string" || !cron) throw { error: "Missing cronName" };

    const p = { payload, cron };
    console.log("In getCronSites, right before function call: ", p);

    const { error: e, readySites, id } = await getCronSites(cron);
    if (e) throw e;

    return NextResponse.json({ readySites, id });
  } catch (e: any) {
    console.error("Error in api: ", e);

    const err = JSON.stringify(e);
    const msg = `Could not get readySites. ${err}`;
    const msgData = { msg, danger: true };

    await setNotification({ msgData, logError: true });
    return NextResponse.json(
      { error: "An error occured: " + err },
      { status: 401 },
    );
  }
}
