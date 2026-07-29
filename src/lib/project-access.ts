import { getLocalDb, isLocalMode, newId } from "@/lib/local/db";
import { resolveViewMoney } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  normalizePermissionOverride,
  normalizeUserRole,
  type PermissionOverride,
  type ProjectAccessRole,
  type ProjectMember,
  type UserRole,
} from "@/lib/types";

export function isAdministrator(role: UserRole) {
  return role === "administrator";
}

export async function listAccessibleProjectIds(
  userId: string,
  role: UserRole,
): Promise<string[] | "all"> {
  if (isAdministrator(role)) return "all";

  if (isLocalMode()) {
    const rows = getLocalDb()
      .prepare(`select project_id from project_members where user_id = ?`)
      .all(userId) as Array<{ project_id: string }>;
    return rows.map((r) => r.project_id);
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("user_id", userId);
  return (data ?? []).map((r) => r.project_id);
}

export async function canAccessProject(
  userId: string,
  role: UserRole,
  projectId: string,
): Promise<boolean> {
  if (isAdministrator(role)) return true;
  if (isLocalMode()) {
    const row = getLocalDb()
      .prepare(
        `select id from project_members where project_id = ? and user_id = ?`,
      )
      .get(projectId, userId);
    return Boolean(row);
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("project_members")
    .select("id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

export async function getProjectAccessRole(
  userId: string,
  role: UserRole,
  projectId: string,
): Promise<ProjectAccessRole | "administrator" | null> {
  const membership = await getProjectMembership(userId, role, projectId);
  return membership.access;
}

export interface ProjectMembership {
  access: ProjectAccessRole | "administrator" | null;
  /** Raw per-member View money override (administrators: always "inherit"). */
  viewMoneyOverride: PermissionOverride;
  /** Effective money visibility on this project (override resolved against role default). */
  canViewMoney: boolean;
}

/**
 * Fetch project access role and effective money visibility in one query.
 * Non-members get `access: null` and no money visibility (administrators
 * bypass membership and always see money).
 */
export async function getProjectMembership(
  userId: string,
  role: UserRole,
  projectId: string,
): Promise<ProjectMembership> {
  if (isAdministrator(role)) {
    return { access: "administrator", viewMoneyOverride: "inherit", canViewMoney: true };
  }

  let row:
    | { access_role: string; view_money: string | null }
    | undefined;
  if (isLocalMode()) {
    row = getLocalDb()
      .prepare(
        `select access_role, view_money from project_members where project_id = ? and user_id = ?`,
      )
      .get(projectId, userId) as typeof row;
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("project_members")
      .select("access_role, view_money")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .maybeSingle();
    row = (data as typeof row) ?? undefined;
  }

  if (!row) {
    return { access: null, viewMoneyOverride: "inherit", canViewMoney: false };
  }
  const override = normalizePermissionOverride(row.view_money);
  return {
    access: (row.access_role as ProjectAccessRole) ?? null,
    viewMoneyOverride: override,
    canViewMoney: resolveViewMoney(role, override),
  };
}

/** Effective View money permission for one user on one project. */
export async function canViewProjectMoney(
  userId: string,
  role: UserRole,
  projectId: string,
): Promise<boolean> {
  const membership = await getProjectMembership(userId, role, projectId);
  return membership.canViewMoney;
}

export async function addProjectMember(opts: {
  projectId: string;
  userId: string;
  accessRole: ProjectAccessRole;
}) {
  if (isLocalMode()) {
    getLocalDb()
      .prepare(
        `insert into project_members (id, project_id, user_id, access_role)
         values (?, ?, ?, ?)
         on conflict(project_id, user_id) do update set
           access_role = excluded.access_role,
           updated_at = datetime('now')`,
      )
      .run(newId(), opts.projectId, opts.userId, opts.accessRole);
    return;
  }
  const supabase = await createClient();
  await supabase.from("project_members").upsert(
    {
      project_id: opts.projectId,
      user_id: opts.userId,
      access_role: opts.accessRole,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id,user_id" },
  );
}

export async function listProjectMembers(
  projectId: string,
): Promise<ProjectMember[]> {
  if (isLocalMode()) {
    const rows = getLocalDb()
      .prepare(
        `select m.id, m.project_id, m.user_id, m.access_role, m.view_money,
                u.email, u.full_name, u.role
         from project_members m
         join user_profiles u on u.id = m.user_id
         where m.project_id = ?
         order by u.email`,
      )
      .all(projectId) as Array<{
      id: string;
      project_id: string;
      user_id: string;
      access_role: ProjectAccessRole;
      view_money: string | null;
      email: string;
      full_name: string | null;
      role: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      project_id: r.project_id,
      user_id: r.user_id,
      access_role: r.access_role,
      view_money: normalizePermissionOverride(r.view_money),
      user_profiles: {
        id: r.user_id,
        email: r.email,
        full_name: r.full_name,
        role: normalizeUserRole(r.role),
      },
    }));
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("project_members")
    .select(
      "id, project_id, user_id, access_role, view_money, user_profiles(id, email, full_name, role)",
    )
    .eq("project_id", projectId)
    .order("created_at");
  return ((data ?? []) as unknown as ProjectMember[]).map((m) => ({
    ...m,
    view_money: normalizePermissionOverride(m.view_money),
  }));
}

export async function removeProjectMember(memberId: string) {
  if (isLocalMode()) {
    getLocalDb().prepare("delete from project_members where id = ?").run(memberId);
    return;
  }
  const supabase = await createClient();
  await supabase.from("project_members").delete().eq("id", memberId);
}

export async function updateProjectMemberAccess(
  memberId: string,
  accessRole: ProjectAccessRole,
) {
  if (isLocalMode()) {
    getLocalDb()
      .prepare(
        `update project_members set access_role = ?, updated_at = datetime('now') where id = ?`,
      )
      .run(accessRole, memberId);
    return;
  }
  const supabase = await createClient();
  await supabase
    .from("project_members")
    .update({ access_role: accessRole, updated_at: new Date().toISOString() })
    .eq("id", memberId);
}

export async function updateProjectMemberViewMoney(
  memberId: string,
  viewMoney: PermissionOverride,
) {
  if (isLocalMode()) {
    getLocalDb()
      .prepare(
        `update project_members set view_money = ?, updated_at = datetime('now') where id = ?`,
      )
      .run(viewMoney, memberId);
    return;
  }
  const supabase = await createClient();
  await supabase
    .from("project_members")
    .update({ view_money: viewMoney, updated_at: new Date().toISOString() })
    .eq("id", memberId);
}

/** Global role capabilities AND project access role. */
export function canEditProjectContent(
  globalRole: UserRole,
  access: ProjectAccessRole | "administrator" | null,
  globalCanEdit: boolean,
) {
  if (!access) return false;
  if (access === "administrator" || access === "manager" || access === "editor") {
    return globalCanEdit;
  }
  return false; // viewer
}

export function canManageProjectMembers(
  access: ProjectAccessRole | "administrator" | null,
) {
  return access === "administrator" || access === "manager";
}
