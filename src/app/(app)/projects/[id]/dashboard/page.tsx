import { notFound } from "next/navigation";
import { ProjectDashboardView } from "@/components/ProjectDashboardView";
import { canViewFinancials, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildProjectDashboard } from "@/lib/projects/dashboard";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  if (!canViewFinancials(profile.role)) {
    return (
      <div className="panel" style={{ padding: "1.25rem" }}>
        <strong>Financial dashboard</strong>
        <p style={{ color: "var(--muted)", marginTop: "0.5rem" }}>
          You do not have permission to view project financials.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const dashboard = await buildProjectDashboard(supabase, id);
  if (!dashboard) notFound();

  return (
    <ProjectDashboardView
      dashboard={dashboard}
      canViewRates={canViewFinancials(profile.role)}
    />
  );
}
