import { NextResponse } from "next/server";
import { acceptInvite } from "@/lib/users";
import { LOCAL_SESSION_COOKIE } from "@/lib/local/session";
import { isLocalMode } from "@/lib/local/db";

export async function POST(request: Request) {
  if (!isLocalMode()) {
    return NextResponse.json(
      { error: "Local invites only" },
      { status: 400 },
    );
  }
  const body = await request.json();
  const result = await acceptInvite({
    token: String(body.token || ""),
    password: String(body.password || ""),
    fullName: body.full_name ?? body.fullName ?? null,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(LOCAL_SESSION_COOKIE, result.userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return res;
}
