import { NextResponse } from "next/server";
import { getLocalDb, isLocalMode, verifyLocalPassword } from "@/lib/local/db";
import { LOCAL_SESSION_COOKIE } from "@/lib/local/session";

export async function POST(request: Request) {
  const body = await request.json();
  const email = String(body.email || "");
  const password = String(body.password || "");

  if (isLocalMode()) {
    // Ensure DB/seed exists
    getLocalDb();
    const user = verifyLocalPassword(email, password);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }
    const res = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      },
    });
    res.cookies.set(LOCAL_SESSION_COOKIE, user.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    return res;
  }

  return NextResponse.json(
    { error: "Local auth endpoint only works in MIXINARY_LOCAL_MODE" },
    { status: 400 },
  );
}
