import { NextResponse } from "next/server";
import { LOCAL_SESSION_COOKIE } from "@/lib/local/session";

function clearSessionCookie(res: NextResponse) {
  res.cookies.set(LOCAL_SESSION_COOKIE, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return res;
}

export async function POST() {
  return clearSessionCookie(NextResponse.json({ ok: true }));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = url.searchParams.get("next") || "/login";
  const target = new URL(next, url.origin);
  // Only allow same-origin relative redirects
  if (!next.startsWith("/")) {
    target.pathname = "/login";
    target.search = "";
  }
  return clearSessionCookie(NextResponse.redirect(target));
}
