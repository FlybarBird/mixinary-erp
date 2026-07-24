import { PortfolioReportView } from "@/components/PortfolioReportView";
import { canViewFinancials, requireProfile } from "@/lib/auth";
import { listAccessibleProjectIds } from "@/lib/project-access";
import { buildPortfolioRows } from "@/lib/projects/portfolio";
import { createClient } from "@/lib/supabase/server";

export default async function PortfolioReportPage() {
  const profile = await requireProfile();
  if (!canViewFinancials(profile.role)) {
    return (
      <div className="panel" style={{ padding: "1.25rem" }}>
        <strong>Portfolio financials</strong>
        <p style={{ color: "var(--muted)", marginTop: "0.5rem" }}>
          You do not have permission to view financials.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const accessible = await listAccessibleProjectIds(profile.id, profile.role);
  const rows = await buildPortfolioRows(
    supabase,
    accessible === "all" ? undefined : accessible,
  );

  return <PortfolioReportView rows={rows} />;
}
