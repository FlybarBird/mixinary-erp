import { notFound } from "next/navigation";
import { ChangeOrdersView } from "@/components/ChangeOrdersView";
import {
  canApproveChangeOrders,
  canEditChangeOrders,
  canViewFinancials,
  requireProfile,
} from "@/lib/auth";
import {
  canEditProjectContent,
  getProjectMembership,
} from "@/lib/project-access";
import { createClient } from "@/lib/supabase/server";
import type { ProjectChangeOrder } from "@/lib/types";

export default async function ChangeOrdersPage({
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
        <strong>Change orders</strong>
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

  const { data } = await supabase
    .from("project_change_orders")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  return (
    <ChangeOrdersView
      projectId={id}
      initialOrders={(data ?? []) as ProjectChangeOrder[]}
      canEdit={canEditProjectContent(
        profile.role,
        membership.access,
        canEditChangeOrders(profile.role),
      )}
      canApprove={canEditProjectContent(
        profile.role,
        membership.access,
        canApproveChangeOrders(profile.role),
      )}
    />
  );
}
