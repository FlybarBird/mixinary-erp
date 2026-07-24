import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getCurrentProfile } from "@/lib/auth";
import { getLocalDb, isLocalMode } from "@/lib/local/db";
import { createClient } from "@/lib/supabase/server";
import { writeUserAudit } from "@/lib/users";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let authMethods: string[] = ["password"];
  if (!isLocalMode()) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const identities = user?.identities?.map((i) => i.provider) ?? [];
      authMethods = identities.length ? identities : ["password"];
    } catch {
      authMethods = ["password"];
    }
  }

  return NextResponse.json({ profile, authMethods });
}

export async function PATCH(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const fullName =
    body.full_name !== undefined
      ? String(body.full_name || "").trim() || null
      : undefined;
  const password = body.password ? String(body.password) : null;
  const currentPassword = body.current_password
    ? String(body.current_password)
    : null;

  if (password && password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 },
    );
  }

  if (isLocalMode()) {
    const db = getLocalDb();
    if (fullName !== undefined) {
      db.prepare(
        `update user_profiles set full_name = ?, updated_at = datetime('now') where id = ?`,
      ).run(fullName, profile.id);
    }
    if (password) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Current password required" },
          { status: 400 },
        );
      }
      const row = db
        .prepare(`select password_hash from user_profiles where id = ?`)
        .get(profile.id) as { password_hash: string } | undefined;
      if (!row || !bcrypt.compareSync(currentPassword, row.password_hash)) {
        return NextResponse.json(
          { error: "Current password is incorrect" },
          { status: 400 },
        );
      }
      db.prepare(
        `update user_profiles set password_hash = ?, updated_at = datetime('now') where id = ?`,
      ).run(bcrypt.hashSync(password, 10), profile.id);
    }
  } else {
    const supabase = await createClient();
    if (fullName !== undefined) {
      const { error } = await supabase
        .from("user_profiles")
        .update({
          full_name: fullName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    if (password) {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
  }

  await writeUserAudit({
    actorId: profile.id,
    targetUserId: profile.id,
    action: "account_updated",
    details: {
      nameChanged: fullName !== undefined,
      passwordChanged: Boolean(password),
    },
  });

  return NextResponse.json({ ok: true });
}
