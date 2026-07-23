import Link from "next/link";
import { notFound } from "next/navigation";
import { BomEditor } from "@/components/BomEditor";
import { canEditPricing, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { LineItem, ProjectSection, Vendor } from "@/lib/types";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: project }, { data: sections }, { data: lines }, { data: vendors }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("*, clients(name)")
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

  if (!project) notFound();

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="muted" style={{ margin: 0 }}>
            <Link href="/projects">Projects</Link> / {project.project_number}
          </p>
          <h1 className="page-title">
            {project.project_number} · {project.name}
          </h1>
          <p className="page-sub">
            {(project.clients as { name?: string } | null)?.name ?? "No client"} ·
            default override {(Number(project.default_override_pct) * 100).toFixed(2)}%
          </p>
        </div>
      </div>

      <BomEditor
        projectId={project.id}
        defaultOverridePct={Number(project.default_override_pct)}
        initialSections={(sections ?? []) as ProjectSection[]}
        initialLines={(lines ?? []) as LineItem[]}
        vendors={(vendors ?? []) as Vendor[]}
        canEditPricing={canEditPricing(profile.role)}
      />
    </div>
  );
}
