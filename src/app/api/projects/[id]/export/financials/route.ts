import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canViewFinancials } from "@/lib/auth";
import { requireProjectApiContext } from "@/lib/project-guard";
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
  const ctx = await requireProjectApiContext(projectId);
  if (ctx instanceof NextResponse) return ctx;
  if (!canViewFinancials(ctx.profile.role) || !ctx.canViewMoney) {
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
