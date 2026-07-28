//src/app/api/setNotification/route.ts

import { setNotification } from "@/lib/server";
import * as jose from "jose";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const token = req.headers.get("Authorization")!;
    const secret = new TextEncoder().encode(process?.env?.JWT_SECRET);

    const { payload } = await jose.jwtVerify(token, secret);

    const { msg, user } = await req.json();

    if (!msg) throw { message: "Worker sent empty 'msg' to setNotification." };

    const u = user ? { user } : { logError: true }; //optionally log to user and not admin;
    const noti = { msgData: { msg, danger: true }, ...u };

    const { error } = await setNotification(noti);
    if (error) throw { error };

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Error in setNotification (API). data: ", e);
    return NextResponse.json({ error: e?.message, status: 500 });
  }
}
