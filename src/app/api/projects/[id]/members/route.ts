import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import {
  mailConfigured,
  sendProjectMemberEmail,
} from "@/lib/email";
import { getLocalDb, isLocalMode } from "@/lib/local/db";
import {
  addProjectMember,
  canAccessProject,
  canManageProjectMembers,
  getProjectAccessRole,
  listProjectMembers,
  removeProjectMember,
  updateProjectMemberAccess,
  updateProjectMemberViewMoney,
} from "@/lib/project-access";
import { createClient } from "@/lib/supabase/server";
import {
  PERMISSION_OVERRIDES,
  PROJECT_ACCESS_LABELS,
  PROJECT_ACCESS_ROLES,
  type PermissionOverride,
  type ProjectAccessRole,
} from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

async function loadProjectLabel(projectId: string) {
  if (isLocalMode()) {
    const row = getLocalDb()
      .prepare(`select project_number, name from projects where id = ?`)
      .get(projectId) as { project_number: string; name: string } | undefined;
    return row ? `${row.project_number} · ${row.name}` : "a project";
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("project_number, name")
    .eq("id", projectId)
    .maybeSingle();
  return data ? `${data.project_number} · ${data.name}` : "a project";
}

async function loadUserEmail(userId: string) {
  if (isLocalMode()) {
    const row = getLocalDb()
      .prepare(`select email from user_profiles where id = ?`)
      .get(userId) as { email: string } | undefined;
    return row?.email ?? null;
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  return data?.email ?? null;
}

export async function GET(_request: Request, ctx: Ctx) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!(await canAccessProject(profile.id, profile.role, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const members = await listProjectMembers(id);
  return NextResponse.json({ members });
}

export async function POST(request: Request, ctx: Ctx) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const access = await getProjectAccessRole(profile.id, profile.role, id);
  if (!canManageProjectMembers(access)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const userId = String(body.user_id || "");
  const accessRole = String(body.access_role || "viewer") as ProjectAccessRole;
  if (!userId) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }
  if (!PROJECT_ACCESS_ROLES.includes(accessRole)) {
    return NextResponse.json({ error: "Invalid access_role" }, { status: 400 });
  }

  await addProjectMember({
    projectId: id,
    userId,
    accessRole,
  });

  let emailed = false;
  if (mailConfigured() && body.notify !== false) {
    const email = await loadUserEmail(userId);
    if (email) {
      const projectLabel = await loadProjectLabel(id);
      const sent = await sendProjectMemberEmail({
        to: email,
        projectLabel,
        accessLabel: PROJECT_ACCESS_LABELS[accessRole],
        projectId: id,
        inviterName: profile.full_name || profile.email,
      });
      emailed = sent.ok;
    }
  }

  const members = await listProjectMembers(id);
  return NextResponse.json({ ok: true, members, emailed });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const access = await getProjectAccessRole(profile.id, profile.role, id);
  if (!canManageProjectMembers(access)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const memberId = String(body.member_id || body.id || "");
  if (!memberId) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const hasAccessRole = body.access_role !== undefined;
  const hasViewMoney = body.view_money !== undefined;
  if (!hasAccessRole && !hasViewMoney) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (hasAccessRole) {
    const accessRole = String(body.access_role || "") as ProjectAccessRole;
    if (!PROJECT_ACCESS_ROLES.includes(accessRole)) {
      return NextResponse.json({ error: "Invalid access_role" }, { status: 400 });
    }
    await updateProjectMemberAccess(memberId, accessRole);
  }

  if (hasViewMoney) {
    const viewMoney = String(body.view_money || "") as PermissionOverride;
    if (!PERMISSION_OVERRIDES.includes(viewMoney)) {
      return NextResponse.json({ error: "Invalid view_money" }, { status: 400 });
    }
    await updateProjectMemberViewMoney(memberId, viewMoney);
  }

  const members = await listProjectMembers(id);
  return NextResponse.json({ ok: true, members });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const access = await getProjectAccessRole(profile.id, profile.role, id);
  if (!canManageProjectMembers(access)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const memberId = searchParams.get("member_id") || searchParams.get("id");
  if (!memberId) {
    return NextResponse.json({ error: "member_id required" }, { status: 400 });
  }
  await removeProjectMember(memberId);
  const members = await listProjectMembers(id);
  return NextResponse.json({ ok: true, members });
}
