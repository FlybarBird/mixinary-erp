import { NextResponse } from "next/server";
import { LOCAL_SESSION_COOKIE } from "@/lib/local/session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(LOCAL_SESSION_COOKIE, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return res;
}
