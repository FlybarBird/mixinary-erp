import { NextResponse } from "next/server";
import { createFirstAdmin, needsSetup } from "@/lib/setup";
import { isLocalMode } from "@/lib/local/db";
import { LOCAL_SESSION_COOKIE } from "@/lib/local/session";

export async function POST(request: Request) {
  if (!(await needsSetup())) {
    return NextResponse.json(
      { error: "Setup is already complete. Sign in instead." },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const result = await createFirstAdmin({
    email: String(body.email || ""),
    password: String(body.password || ""),
    fullName: String(body.full_name || body.fullName || ""),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const res = NextResponse.json({
    ok: true,
    user: {
      id: result.userId,
      email: result.email,
      full_name: result.fullName,
      role: "administrator",
    },
  });

  if (isLocalMode()) {
    res.cookies.set(LOCAL_SESSION_COOKIE, result.userId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    });
  }

  return res;
}
