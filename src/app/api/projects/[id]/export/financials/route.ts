import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canViewFinancials, getCurrentProfile } from "@/lib/auth";
import { canAccessProject } from "@/lib/project-access";
import { buildProjectDashboard } from "@/lib/projects/dashboard";

function esc(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(cols: unknown[]): string {
  return cols.map(esc).join(",");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canViewFinancials(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await canAccessProject(profile.id, profile.role, projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const dashboard = await buildProjectDashboard(supabase, projectId);
  if (!dashboard) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const asOf = new Date().toISOString();
  const sections: string[] = [];

  sections.push(
    row(["As of", asOf]),
    row(["Project", dashboard.projectNumber, dashboard.projectName]),
    "",
    "EXECUTIVE SUMMARY",
    row([
      "Current Revenue",
      "Original Budget",
      "Revised Budget",
      "Forecast Final Cost",
      "Forecast Profit",
      "Forecast Margin",
      "Cash Position",
      "Cash Paid Out",
      "Collected",
      "AR",
      "Unbilled",
    ]),
    row([
      dashboard.currentRevenue,
      dashboard.originalCostBudget,
      dashboard.revisedCostBudget,
      dashboard.forecastFinalCost,
      dashboard.forecastProfit,
      dashboard.forecastMargin == null
        ? ""
        : (dashboard.forecastMargin * 100).toFixed(2),
      dashboard.cashPosition,
      dashboard.cashPaidOut,
      dashboard.collected,
      dashboard.arOutstanding,
      dashboard.unbilled,
    ]),
    "",
    "BUDGET VS ACTUAL BY CATEGORY",
    row([
      "Category",
      "Budget",
      "Committed",
      "Actual",
      "Forecast Final",
      "Variance",
    ]),
  );

  for (const c of dashboard.categories) {
    sections.push(
      row([
        c.category,
        c.budget,
        c.committed,
        c.actual,
        c.forecastFinal,
        c.variance,
      ]),
    );
  }

  sections.push(
    "",
    "PROFIT WATERFALL",
    row(["Step", "Amount", "Running"]),
  );
  for (const step of dashboard.profitWaterfall) {
    sections.push(row([step.label, step.amount, step.running]));
  }

  sections.push(
    "",
    "BILLING / AR",
    row(["Billed", "Collected", "AR", "Unbilled", "% Invoiced", "% Collected"]),
    row([
      dashboard.billed,
      dashboard.collected,
      dashboard.arOutstanding,
      dashboard.unbilled,
      dashboard.progress.percentInvoiced,
      dashboard.progress.percentCollected,
    ]),
  );

  const csv = sections.join("\r\n");
  const stamp = asOf.slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="financials-${dashboard.projectNumber}-${stamp}.csv"`,
    },
  });
}
