import { notFound } from "next/navigation";
import { LaborView } from "@/components/LaborView";
import { canEditLabor, canApproveLabor, requireProfile } from "@/lib/auth";
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
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (!project) notFound();

  const { data: entries } = await supabase
    .from("labor_entries")
    .select("*")
    .eq("project_id", id)
    .order("work_date", { ascending: false });

  return (
    <LaborView
      projectId={id}
      initialEntries={(entries ?? []) as LaborEntry[]}
      canEdit={canEditLabor(profile.role)}
      canApprove={canApproveLabor(profile.role)}
    />
  );
}
