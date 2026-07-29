import { notFound } from "next/navigation";
import { LaborEditor } from "@/components/LaborEditor";
import {
  canApproveLabor,
  canEditLabor,
  requireProfile,
} from "@/lib/auth";
import { redactLaborEntryMoney } from "@/lib/money-redaction";
import {
  canEditProjectContent,
  getProjectMembership,
} from "@/lib/project-access";
import { createClient } from "@/lib/supabase/server";
import type { LaborEntry } from "@/lib/types";

export default async function LaborPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const membership = await getProjectMembership(profile.id, profile.role, id);
  const canMoney = membership.canViewMoney;
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

  const safeEntries = ((entries ?? []).filter(Boolean) as LaborEntry[]).map(
    (entry) => (canMoney ? entry : redactLaborEntryMoney(entry)),
  );

  return (
    <LaborEditor
      projectId={id}
      defaultOverridePct={Number(project.default_override_pct ?? 0)}
      initialLines={safeEntries}
      canEdit={canEditProjectContent(
        profile.role,
        membership.access,
        canEditLabor(profile.role),
      )}
      canApprove={canEditProjectContent(
        profile.role,
        membership.access,
        canApproveLabor(profile.role),
      )}
      canViewRates={canMoney}
    />
  );
}
