import { notFound } from "next/navigation";
import { SubcontractsView } from "@/components/SubcontractsView";
import {
  canEditSubcontracts,
  canViewFinancials,
  requireProfile,
} from "@/lib/auth";
import {
  canEditProjectContent,
  getProjectMembership,
} from "@/lib/project-access";
import { createClient } from "@/lib/supabase/server";
import type { ProjectSubcontract } from "@/lib/types";

export default async function SubcontractsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const membership = await getProjectMembership(profile.id, profile.role, id);
  if (!canViewFinancials(profile.role) || !membership.canViewMoney) {
    return (
      <div className="panel" style={{ padding: "1.25rem" }}>
        <strong>Subcontracts</strong>
        <p style={{ color: "var(--muted)", marginTop: "0.5rem" }}>
          You do not have permission to view project financials.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  const [{ data: subs }, { data: bills }, { data: vendors }] = await Promise.all([
    supabase
      .from("project_subcontracts")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("project_subcontract_bills")
      .select("*")
      .eq("project_id", id),
    supabase.from("vendors").select("id, name").order("name"),
  ]);

  const bySub = new Map<string, NonNullable<typeof bills>>();
  for (const b of bills ?? []) {
    const list = bySub.get(b.subcontract_id) ?? [];
    list.push(b);
    bySub.set(b.subcontract_id, list);
  }

  return (
    <SubcontractsView
      projectId={id}
      initialSubs={(subs ?? []).map((s) => ({
        ...s,
        bills: bySub.get(s.id) ?? [],
      })) as ProjectSubcontract[]}
      vendors={vendors ?? []}
      canEdit={canEditProjectContent(
        profile.role,
        membership.access,
        canEditSubcontracts(profile.role),
      )}
    />
  );
}
