import { notFound } from "next/navigation";
import { LaborEditor } from "@/components/LaborEditor";
import {
  canEditLabor,
  canApproveLabor,
  canViewFinancials,
  requireProfile,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { LaborEntry } from "@/lib/types";

export default async function LaborPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, default_override_pct")
    .eq("id", id)
    .maybeSingle();

  if (!project) notFound();

  const { data: entries } = await supabase
    .from("labor_entries")
    .select("*")
    .eq("project_id", id)
    .order("sort_order", { ascending: true })
    .order("work_date", { ascending: true });

  return (
    <LaborEditor
      projectId={id}
      defaultOverridePct={Number(project.default_override_pct ?? 0)}
      initialLines={((entries ?? []).filter(Boolean) as LaborEntry[])}
      canEdit={canEditLabor(profile.role)}
      canApprove={canApproveLabor(profile.role)}
      canViewRates={canViewFinancials(profile.role)}
    />
  );
}
