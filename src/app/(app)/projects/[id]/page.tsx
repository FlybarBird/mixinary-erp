import { BomEditor } from "@/components/BomEditor";
import { canEditBom, requireProfile } from "@/lib/auth";
import {
  canEditProjectContent,
  getProjectAccessRole,
} from "@/lib/project-access";
import { createClient } from "@/lib/supabase/server";
import type { LineItem, ProjectSection, Vendor } from "@/lib/types";

export default async function ProjectBomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const access = await getProjectAccessRole(profile.id, profile.role, id);
  const supabase = await createClient();

  const [{ data: project }, { data: sections }, { data: lines }, { data: vendors }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("id, default_override_pct")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("project_sections")
        .select("*")
        .eq("project_id", id)
        .order("sort_order"),
      supabase
        .from("line_items")
        .select("*, vendors(code, name)")
        .eq("project_id", id)
        .order("sort_order"),
      supabase.from("vendors").select("*").order("code"),
    ]);

  if (!project) return null;

  return (
    <BomEditor
      projectId={project.id}
      defaultOverridePct={Number(project.default_override_pct)}
      initialSections={(sections ?? []) as ProjectSection[]}
      initialLines={(lines ?? []) as LineItem[]}
      vendors={(vendors ?? []) as Vendor[]}
      canEditPricing={canEditProjectContent(
        profile.role,
        access,
        canEditBom(profile.role),
      )}
    />
  );
}
