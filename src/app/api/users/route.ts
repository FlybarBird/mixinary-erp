import { NextResponse } from "next/server";
import { canManageAdmin, getCurrentProfile } from "@/lib/auth";
import {
  createOrInviteUser,
  deleteOrDeactivateUser,
  listUserAudit,
  listUsers,
  updateUser,
} from "@/lib/users";
import { normalizeUserRole, USER_ROLES } from "@/lib/types";

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canManageAdmin(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const activeParam = searchParams.get("active");
  const includeAudit = searchParams.get("audit") === "1";

  let active: boolean | "all" = "all";
  if (activeParam === "true" || activeParam === "1") active = true;
  if (activeParam === "false" || activeParam === "0") active = false;

  const users = await listUsers({ active });
  const audit = includeAudit ? await listUserAudit(40) : undefined;
  return NextResponse.json({ users, audit });
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canManageAdmin(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const role = normalizeUserRole(body.role);
  if (!USER_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const result = await createOrInviteUser({
    actorId: profile.id,
    email: String(body.email || ""),
    fullName: body.full_name ?? body.fullName ?? null,
    role,
    password: body.password ? String(body.password) : null,
    invite: Boolean(body.invite) || !body.password,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    user: result.user,
    inviteUrl: result.inviteUrl,
    emailed: result.emailed,
  });
}

export async function PATCH(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canManageAdmin(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const id = String(body.id || "");
  if (!id) {
    return NextResponse.json({ error: "User id required" }, { status: 400 });
  }

  if (body.role !== undefined) {
    const role = normalizeUserRole(body.role);
    if (!USER_ROLES.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
  }

  const result = await updateUser({
    actorId: profile.id,
    id,
    fullName:
      body.full_name !== undefined
        ? body.full_name
        : body.fullName !== undefined
          ? body.fullName
          : undefined,
    email: body.email !== undefined ? String(body.email) : undefined,
    role: body.role !== undefined ? normalizeUserRole(body.role) : undefined,
    active: body.active !== undefined ? Boolean(body.active) : undefined,
    password: body.password ? String(body.password) : null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canManageAdmin(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || "";
  const hard = searchParams.get("hard") === "1";
  if (!id) {
    return NextResponse.json({ error: "User id required" }, { status: 400 });
  }

  if (id === profile.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account here" },
      { status: 400 },
    );
  }

  const result = await deleteOrDeactivateUser({
    actorId: profile.id,
    id,
    hard,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
