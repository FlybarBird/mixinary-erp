import { notFound } from "next/navigation";
import { ProjectHeader } from "@/components/ProjectHeader";
import { ProjectWorkspaceNav } from "@/components/ProjectWorkspaceNav";
import { ProjectExportMenu } from "@/components/ProjectExportMenu";
import { ProjectMembersPanel } from "@/components/ProjectMembersPanel";
import { canEditBom, requireProfile } from "@/lib/auth";
import {
  canAccessProject,
  canEditProjectContent,
  canManageProjectMembers,
  getProjectAccessRole,
  listProjectMembers,
} from "@/lib/project-access";
import { listUsers } from "@/lib/users";
import { createClient } from "@/lib/supabase/server";
import type { ProjectStatus } from "@/lib/types";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();

  if (!(await canAccessProject(profile.id, profile.role, id))) {
    notFound();
  }

  const access = await getProjectAccessRole(profile.id, profile.role, id);
  const supabase = await createClient();

  const [{ data: project }, { data: clients }, { data: managers }, members, users] =
    await Promise.all([
      supabase
        .from("projects")
        .select("*, clients(name)")
        .eq("id", id)
        .maybeSingle(),
      supabase.from("clients").select("id, name").order("name"),
      supabase
        .from("user_profiles")
        .select("id, full_name, email")
        .order("full_name"),
      listProjectMembers(id),
      listUsers({ active: true }),
    ]);

  if (!project) notFound();

  const managerId =
    (project as { project_manager_id?: string | null }).project_manager_id ??
    null;
  const manager = managers?.find((m) => m.id === managerId);
  const canEdit = canEditProjectContent(
    profile.role,
    access,
    canEditBom(profile.role),
  );
  const canManageMembers = canManageProjectMembers(access);

  return (
    <div className="stack">
      <ProjectHeader
        project={{
          id: project.id,
          project_number: project.project_number,
          name: project.name,
          client_id: project.client_id,
          project_manager_id: managerId,
          material_budget:
            (project as { material_budget?: number | null }).material_budget ??
            null,
          labor_budget:
            (project as { labor_budget?: number | null }).labor_budget ?? null,
          status: project.status as ProjectStatus,
          default_override_pct: Number(project.default_override_pct),
          notes: project.notes,
          client_name:
            (project.clients as { name?: string } | null)?.name ?? null,
          project_manager_name: manager?.full_name || manager?.email || null,
        }}
        clients={clients ?? []}
        managers={(managers ?? []).map((m) => ({
          id: m.id,
          name: m.full_name || m.email,
        }))}
        canEdit={canEdit}
      />
      <ProjectMembersPanel
        projectId={id}
        initialMembers={members}
        users={users}
        canManage={canManageMembers}
      />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
        <ProjectWorkspaceNav projectId={id} />
        <ProjectExportMenu projectId={id} />
      </div>
      {children}
    </div>
  );
}
