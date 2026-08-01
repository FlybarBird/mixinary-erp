import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { enqueueErpOutbox } from "@/lib/integration/outbox";
import { createClient } from "@/lib/supabase/server";
import { getLocalDb, isLocalMode } from "@/lib/local/db";

/** Admin: grant or revoke Project Management access for a user. */
export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "administrator") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const userId = String(body.userId || "");
  const action = body.action === "disable" ? "disable" : "enable";
  const planeRole = String(body.planeRole || "member");
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  let email = "";
  let idpSubject = "";
  if (isLocalMode()) {
    const row = getLocalDb()
      .prepare(
        `select email, idp_subject from user_profiles where id=?`,
      )
      .get(userId) as { email: string; idp_subject?: string } | undefined;
    if (!row) return NextResponse.json({ error: "User not found" }, { status: 404 });
    email = row.email;
    idpSubject = row.idp_subject || `local:${userId}`;
    getLocalDb()
      .prepare(`update user_profiles set pm_access=? where id=?`)
      .run(action === "enable" ? 1 : 0, userId);
  } else {
    const supabase = await createClient();
    const { data: row } = await supabase
      .from("user_profiles")
      .select("email, idp_subject")
      .eq("id", userId)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: "User not found" }, { status: 404 });
    email = row.email;
    idpSubject = row.idp_subject || `erp:${userId}`;
    await supabase
      .from("user_profiles")
      .update({ pm_access: action === "enable" })
      .eq("id", userId);
  }

  if (action === "enable") {
    await enqueueErpOutbox({
      eventType: "user.provision",
      idempotencyKey: `user.provision:${userId}:${Date.now()}`,
      payload: {
        erpUserId: userId,
        idpSubject,
        verifiedEmail: email,
        planeRole,
        planeAccessStatus: "enabled",
      },
    });
  } else {
    await enqueueErpOutbox({
      eventType: "user.disable",
      idempotencyKey: `user.disable:${userId}:${Date.now()}`,
      payload: { erpUserId: userId },
    });
  }

  return NextResponse.json({ ok: true, action, userId });
}
