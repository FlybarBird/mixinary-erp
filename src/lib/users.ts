import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";
import { getLocalDb, isLocalMode, newId } from "@/lib/local/db";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  buildInviteUrl,
  mailConfigured,
  sendInviteEmail,
} from "@/lib/email";
import {
  normalizeUserRole,
  USER_ROLE_LABELS,
  USER_ROLES,
  type UserProfile,
  type UserRole,
} from "@/lib/types";

export function countActiveAdmins(): number {
  if (isLocalMode()) {
    const row = getLocalDb()
      .prepare(
        `select count(*) as c from user_profiles
         where role = 'administrator' and coalesce(active, 1) = 1`,
      )
      .get() as { c: number };
    return row.c;
  }
  return -1; // async path used for supabase
}

export async function countActiveAdminsAsync(): Promise<number> {
  if (isLocalMode()) return countActiveAdmins();
  const supabase = await createClient();
  const { count } = await supabase
    .from("user_profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "administrator")
    .eq("active", true);
  return count ?? 0;
}

export async function writeUserAudit(opts: {
  actorId: string | null;
  targetUserId: string | null;
  action: string;
  details?: Record<string, unknown>;
}) {
  const details = opts.details ? JSON.stringify(opts.details) : null;
  if (isLocalMode()) {
    getLocalDb()
      .prepare(
        `insert into user_audit_events (id, actor_id, target_user_id, action, details)
         values (?, ?, ?, ?, ?)`,
      )
      .run(
        newId(),
        opts.actorId,
        opts.targetUserId,
        opts.action,
        details,
      );
    return;
  }
  const service = createServiceClient();
  await service.from("user_audit_events").insert({
    actor_id: opts.actorId,
    target_user_id: opts.targetUserId,
    action: opts.action,
    details: opts.details ?? null,
  });
}

export async function listUsers(opts?: {
  active?: boolean | "all";
}): Promise<UserProfile[]> {
  const filter = opts?.active ?? "all";
  if (isLocalMode()) {
    let sql =
      "select id, email, full_name, role, coalesce(active, 1) as active from user_profiles";
    if (filter === true) sql += " where coalesce(active, 1) = 1";
    if (filter === false) sql += " where coalesce(active, 1) = 0";
    sql += " order by email";
    const rows = getLocalDb().prepare(sql).all() as Array<{
      id: string;
      email: string;
      full_name: string | null;
      role: string;
      active: number;
    }>;
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      full_name: r.full_name,
      role: normalizeUserRole(r.role),
      active: Boolean(r.active),
    }));
  }

  const supabase = await createClient();
  let q = supabase
    .from("user_profiles")
    .select("id, email, full_name, role, active")
    .order("email");
  if (filter === true) q = q.eq("active", true);
  if (filter === false) q = q.eq("active", false);
  const { data } = await q;
  return (data ?? []).map((r) => ({
    id: r.id,
    email: r.email,
    full_name: r.full_name,
    role: normalizeUserRole(r.role),
    active: r.active !== false,
  }));
}

export async function createOrInviteUser(opts: {
  actorId: string;
  email: string;
  fullName?: string | null;
  role: UserRole;
  password?: string | null;
  invite?: boolean;
}): Promise<
  | {
      ok: true;
      user?: UserProfile;
      inviteUrl?: string;
      emailed?: boolean;
    }
  | { ok: false; error: string; status: number }
> {
  const email = opts.email.trim().toLowerCase();
  const role = normalizeUserRole(opts.role);
  if (!USER_ROLES.includes(role)) {
    return { ok: false, error: "Invalid role", status: 400 };
  }
  if (!email.includes("@")) {
    return { ok: false, error: "Invalid email", status: 400 };
  }

  const invite = opts.invite || !opts.password;
  const fullName = opts.fullName?.trim() || null;

  if (isLocalMode()) {
    const db = getLocalDb();
    const existing = db
      .prepare("select id from user_profiles where lower(email) = lower(?)")
      .get(email) as { id: string } | undefined;
    if (existing) {
      return { ok: false, error: "A user with that email already exists", status: 409 };
    }

    if (invite) {
      const token = randomBytes(24).toString("hex");
      const id = newId();
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare(
        `insert into user_invites (id, email, full_name, role, token, invited_by, expires_at)
         values (?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, email, fullName, role, token, opts.actorId, expires);
      const inviteUrl = buildInviteUrl(token);
      let emailed = false;
      if (mailConfigured()) {
        const sent = await sendInviteEmail({
          to: email,
          inviteUrl,
          fullName,
          roleLabel: USER_ROLE_LABELS[role],
        });
        emailed = sent.ok;
      }
      await writeUserAudit({
        actorId: opts.actorId,
        targetUserId: null,
        action: "invite_created",
        details: { email, role },
      });
      return { ok: true, inviteUrl, emailed };
    }

    const password = String(opts.password);
    if (password.length < 8) {
      return { ok: false, error: "Password must be at least 8 characters", status: 400 };
    }
    const id = randomUUID();
    db.prepare(
      `insert into user_profiles (id, email, full_name, role, password_hash, active)
       values (?, ?, ?, ?, ?, 1)`,
    ).run(id, email, fullName, role, bcrypt.hashSync(password, 10));
    const user: UserProfile = {
      id,
      email,
      full_name: fullName,
      role,
      active: true,
    };
    await writeUserAudit({
      actorId: opts.actorId,
      targetUserId: id,
      action: "user_created",
      details: { email, role },
    });
    return { ok: true, user };
  }

  // Supabase
  try {
    const service = createServiceClient();
    if (invite) {
      const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName, role },
        redirectTo: `${(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")}/auth/callback`,
      });
      if (error) {
        return { ok: false, error: error.message, status: 400 };
      }
      if (data.user) {
        await service.from("user_profiles").upsert({
          id: data.user.id,
          email,
          full_name: fullName,
          role,
          active: true,
        });
      }
      await writeUserAudit({
        actorId: opts.actorId,
        targetUserId: data.user?.id ?? null,
        action: "invite_created",
        details: { email, role },
      });
      return { ok: true, emailed: true };
    }

    const password = String(opts.password);
    if (password.length < 8) {
      return { ok: false, error: "Password must be at least 8 characters", status: 400 };
    }
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    });
    if (error || !data.user) {
      return {
        ok: false,
        error: error?.message || "Failed to create user",
        status: 400,
      };
    }
    await service.from("user_profiles").upsert({
      id: data.user.id,
      email,
      full_name: fullName,
      role,
      active: true,
    });
    await writeUserAudit({
      actorId: opts.actorId,
      targetUserId: data.user.id,
      action: "user_created",
      details: { email, role },
    });
    return {
      ok: true,
      user: {
        id: data.user.id,
        email,
        full_name: fullName,
        role,
        active: true,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to create user",
      status: 500,
    };
  }
}

export async function updateUser(opts: {
  actorId: string;
  id: string;
  fullName?: string | null;
  email?: string;
  role?: UserRole;
  active?: boolean;
  password?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const targetId = opts.id;

  if (isLocalMode()) {
    const db = getLocalDb();
    const current = db
      .prepare(
        `select id, email, full_name, role, coalesce(active, 1) as active
         from user_profiles where id = ?`,
      )
      .get(targetId) as
      | {
          id: string;
          email: string;
          full_name: string | null;
          role: string;
          active: number;
        }
      | undefined;
    if (!current) return { ok: false, error: "User not found", status: 404 };

    const nextRole =
      opts.role !== undefined ? normalizeUserRole(opts.role) : normalizeUserRole(current.role);
    const nextActive =
      opts.active !== undefined ? opts.active : Boolean(current.active);

    if (
      normalizeUserRole(current.role) === "administrator" &&
      current.active &&
      (nextRole !== "administrator" || !nextActive)
    ) {
      const admins = countActiveAdmins();
      if (admins <= 1) {
        return {
          ok: false,
          error: "Cannot demote or deactivate the last administrator",
          status: 400,
        };
      }
    }

    const email = opts.email?.trim().toLowerCase() || current.email;
    const fullName =
      opts.fullName !== undefined ? opts.fullName?.trim() || null : current.full_name;

    db.prepare(
      `update user_profiles
       set email = ?, full_name = ?, role = ?, active = ?,
           updated_at = datetime('now')
       where id = ?`,
    ).run(email, fullName, nextRole, nextActive ? 1 : 0, targetId);

    if (opts.password) {
      if (opts.password.length < 8) {
        return { ok: false, error: "Password must be at least 8 characters", status: 400 };
      }
      db.prepare(
        `update user_profiles set password_hash = ?, updated_at = datetime('now') where id = ?`,
      ).run(bcrypt.hashSync(opts.password, 10), targetId);
    }

    await writeUserAudit({
      actorId: opts.actorId,
      targetUserId: targetId,
      action: "user_updated",
      details: {
        email,
        role: nextRole,
        active: nextActive,
        passwordReset: Boolean(opts.password),
      },
    });
    return { ok: true };
  }

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("user_profiles")
    .select("id, email, full_name, role, active")
    .eq("id", targetId)
    .maybeSingle();
  if (!current) return { ok: false, error: "User not found", status: 404 };

  const nextRole =
    opts.role !== undefined ? normalizeUserRole(opts.role) : normalizeUserRole(current.role);
  const nextActive =
    opts.active !== undefined ? opts.active : current.active !== false;

  if (
    normalizeUserRole(current.role) === "administrator" &&
    current.active !== false &&
    (nextRole !== "administrator" || !nextActive)
  ) {
    const admins = await countActiveAdminsAsync();
    if (admins <= 1) {
      return {
        ok: false,
        error: "Cannot demote or deactivate the last administrator",
        status: 400,
      };
    }
  }

  const email = opts.email?.trim().toLowerCase() || current.email;
  const fullName =
    opts.fullName !== undefined ? opts.fullName?.trim() || null : current.full_name;

  const { error } = await supabase
    .from("user_profiles")
    .update({
      email,
      full_name: fullName,
      role: nextRole,
      active: nextActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", targetId);
  if (error) return { ok: false, error: error.message, status: 400 };

  if (opts.password || opts.email) {
    const service = createServiceClient();
    const patch: { password?: string; email?: string; user_metadata?: object } = {};
    if (opts.password) {
      if (opts.password.length < 8) {
        return { ok: false, error: "Password must be at least 8 characters", status: 400 };
      }
      patch.password = opts.password;
    }
    if (opts.email) patch.email = email;
    const { error: authErr } = await service.auth.admin.updateUserById(targetId, patch);
    if (authErr) return { ok: false, error: authErr.message, status: 400 };
  }

  await writeUserAudit({
    actorId: opts.actorId,
    targetUserId: targetId,
    action: "user_updated",
    details: {
      email,
      role: nextRole,
      active: nextActive,
      passwordReset: Boolean(opts.password),
    },
  });
  return { ok: true };
}

export async function deleteOrDeactivateUser(opts: {
  actorId: string;
  id: string;
  hard?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!opts.hard) {
    return updateUser({
      actorId: opts.actorId,
      id: opts.id,
      active: false,
    });
  }

  if (isLocalMode()) {
    const db = getLocalDb();
    const current = db
      .prepare(
        `select role, coalesce(active, 1) as active from user_profiles where id = ?`,
      )
      .get(opts.id) as { role: string; active: number } | undefined;
    if (!current) return { ok: false, error: "User not found", status: 404 };
    if (current.active) {
      return { ok: false, error: "Deactivate the user before hard delete", status: 400 };
    }
    if (normalizeUserRole(current.role) === "administrator") {
      const admins = countActiveAdmins();
      if (admins <= 0) {
        return { ok: false, error: "Cannot delete the last administrator", status: 400 };
      }
    }
    db.prepare("delete from user_profiles where id = ?").run(opts.id);
    await writeUserAudit({
      actorId: opts.actorId,
      targetUserId: opts.id,
      action: "user_deleted",
    });
    return { ok: true };
  }

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("user_profiles")
    .select("role, active")
    .eq("id", opts.id)
    .maybeSingle();
  if (!current) return { ok: false, error: "User not found", status: 404 };
  if (current.active !== false) {
    return { ok: false, error: "Deactivate the user before hard delete", status: 400 };
  }
  const service = createServiceClient();
  const { error } = await service.auth.admin.deleteUser(opts.id);
  if (error) return { ok: false, error: error.message, status: 400 };
  await writeUserAudit({
    actorId: opts.actorId,
    targetUserId: opts.id,
    action: "user_deleted",
  });
  return { ok: true };
}

export async function listUserAudit(limit = 40) {
  if (isLocalMode()) {
    return getLocalDb()
      .prepare(
        `select id, actor_id, target_user_id, action, details, created_at
         from user_audit_events
         order by created_at desc
         limit ?`,
      )
      .all(limit);
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_audit_events")
    .select("id, actor_id, target_user_id, action, details, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function acceptInvite(opts: {
  token: string;
  password: string;
  fullName?: string | null;
}): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string; status: number }
> {
  if (!isLocalMode()) {
    return {
      ok: false,
      error: "Invite tokens are for local mode; use your email invite link",
      status: 400,
    };
  }
  if (opts.password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters", status: 400 };
  }

  const db = getLocalDb();
  const invite = db
    .prepare(
      `select * from user_invites where token = ? and accepted_at is null`,
    )
    .get(opts.token) as
    | {
        id: string;
        email: string;
        full_name: string | null;
        role: string;
        expires_at: string;
      }
    | undefined;

  if (!invite) {
    return { ok: false, error: "Invite not found or already used", status: 404 };
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "Invite has expired", status: 400 };
  }

  const existing = db
    .prepare("select id from user_profiles where lower(email) = lower(?)")
    .get(invite.email) as { id: string } | undefined;
  if (existing) {
    return { ok: false, error: "A user with that email already exists", status: 409 };
  }

  const id = randomUUID();
  const fullName =
    opts.fullName?.trim() || invite.full_name || invite.email.split("@")[0];
  const role = normalizeUserRole(invite.role);

  db.prepare(
    `insert into user_profiles (id, email, full_name, role, password_hash, active)
     values (?, ?, ?, ?, ?, 1)`,
  ).run(id, invite.email, fullName, role, bcrypt.hashSync(opts.password, 10));

  db.prepare(
    `update user_invites set accepted_at = datetime('now') where id = ?`,
  ).run(invite.id);

  await writeUserAudit({
    actorId: id,
    targetUserId: id,
    action: "invite_accepted",
    details: { email: invite.email, role },
  });

  return { ok: true, userId: id };
}
