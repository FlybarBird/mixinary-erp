import { NextResponse } from "next/server";
import { getLocalDb, isLocalMode, verifyLocalPassword } from "@/lib/local/db";
import { LOCAL_SESSION_COOKIE } from "@/lib/local/session";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json();
  const email = String(body.email || "");
  const password = String(body.password || "");

  if (isLocalMode()) {
    getLocalDb();
    const row = getLocalDb()
      .prepare(
        `select coalesce(active, 1) as active from user_profiles
         where lower(email) = lower(?)`,
      )
      .get(email) as { active: number } | undefined;
    if (row && !row.active) {
      return NextResponse.json(
        { error: "This account has been deactivated. Contact an administrator." },
        { status: 403 },
      );
    }
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

/** Supabase password login with active-check (used by LoginForm). */
export async function PUT(request: Request) {
  if (isLocalMode()) {
    return NextResponse.json({ error: "Not available in local mode" }, { status: 400 });
  }
  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: profile } = await service
    .from("user_profiles")
    .select("id, active")
    .ilike("email", email)
    .maybeSingle();
  if (profile && profile.active === false) {
    return NextResponse.json(
      { error: "This account has been deactivated. Contact an administrator." },
      { status: 403 },
    );
  }
  return NextResponse.json({ ok: true });
}
