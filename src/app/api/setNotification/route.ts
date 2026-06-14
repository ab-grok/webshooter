//src/app/api/setNotification/route.ts

import { setNotification } from "@/lib/server";
import * as jose from "jose";

export async function POST(req: Request) {
  try {
    const token = req.headers.get("Authorization")!;
    const secret = new TextEncoder().encode(process?.env?.JWT_SECRET);

    const { payload } = await jose.jwtVerify(token, secret);

    const msg = (await req.json()).msg;

    if (!msg) throw { message: "Worker sent empty 'msg' to setNotification." };

    const noti = { msgData: { msg, danger: true }, logError: true };

    const { error } = await setNotification(noti);
    if (error) throw { error };
  } catch (e) {
    console.error("Error in setNotification (API). data: ", e);
  }
}
