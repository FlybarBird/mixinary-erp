import { newId } from "@/lib/local/db";
import { createClient } from "@/lib/supabase/server";
import {
  arOutstanding,
  currentRevenue,
  forecastFinalCost,
  forecastMargin,
  forecastProfit,
  materialOnlyProfit,
  originalCostBudget,
  revisedCostBudget,
  sumLedgerRows,
  totalBilled,
  totalCollected,
} from "@/lib/projects/financials";
import { calculateLinePricing, sumPricing } from "@/lib/pricing";
import { ensureProjectCostLedger } from "@/lib/projects/cost-ledger";

type Client = Awaited<ReturnType<typeof createClient>>;

export type SnapshotTrigger =
  | "manual"
  | "co_approved"
  | "invoice_sent"
  | "payment"
  | "ledger_rebuild"
  | "nightly";

/**
 * Capture a financial snapshot. Skips near-duplicate ledger_rebuild snaps
 * within 5 minutes when values are unchanged.
 */
export async function captureProjectFinancialSnapshot(
  supabase: Client,
  projectId: string,
  trigger: SnapshotTrigger,
) {
  await ensureProjectCostLedger(supabase, projectId);

  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, original_revenue, revenue_additions, revenue_credits, material_budget, labor_budget, expense_budget, subcontractor_budget, overhead_budget, percent_complete, default_override_pct",
    )
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return null;

  const [
    { data: changeOrders },
    { data: ledgerRows },
    { data: invoices },
    { data: payments },
    { data: lineItems },
  ] = await Promise.all([
    supabase
      .from("project_change_orders")
      .select(
        "status, revenue_delta, budget_material_delta, budget_labor_delta, budget_expense_delta, budget_subcontractor_delta, budget_overhead_delta",
      )
      .eq("project_id", projectId),
    supabase.from("project_cost_ledger").select("*").eq("project_id", projectId),
    supabase
      .from("project_invoices")
      .select("status, total")
      .eq("project_id", projectId),
    supabase
      .from("project_payments")
      .select("amount")
      .eq("project_id", projectId),
    supabase
      .from("line_items")
      .select("qty, msrp, quote, override_pct")
      .eq("project_id", projectId),
  ]);

  const cos = changeOrders ?? [];
  const totals = sumLedgerRows(ledgerRows ?? []);
  const finalCost = forecastFinalCost(totals);
  const revenue = currentRevenue(
    {
      original_revenue: project.original_revenue as number | null,
      revenue_additions: project.revenue_additions as number | null,
      revenue_credits: project.revenue_credits as number | null,
    },
    cos,
  );
  const buckets = {
    material_budget: project.material_budget as number | null,
    labor_budget: project.labor_budget as number | null,
    expense_budget: project.expense_budget as number | null,
    subcontractor_budget: project.subcontractor_budget as number | null,
    overhead_budget: project.overhead_budget as number | null,
  };
  const originalBudget = originalCostBudget(buckets);
  const revisedBudget = revisedCostBudget(buckets, cos);
  const profit = forecastProfit(revenue, finalCost);
  const margin = forecastMargin(profit, revenue);
  const billed = totalBilled(invoices ?? []);
  const collected = totalCollected(payments ?? []);
  const ar = arOutstanding(billed, collected);
  const defaultOverride = Number(project.default_override_pct || 0);
  const materialSale = sumPricing(
    (lineItems ?? []).map((line) =>
      calculateLinePricing({
        qty: line.qty,
        msrp: line.msrp,
        quote: line.quote,
        overridePct: line.override_pct,
        projectDefaultOverridePct: defaultOverride,
      }),
    ),
  ).totalSale;
  const materialForecast = (ledgerRows ?? [])
    .filter((r) => r.category === "materials" || r.category === "freight")
    .reduce(
      (s, r) =>
        s +
        Number(r.actual_amount || 0) +
        Number(r.committed_amount || 0) +
        Number(r.forecast_amount || 0),
      0,
    );
  const matProfit = materialOnlyProfit(materialSale, materialForecast);

  const row = {
    id: newId(),
    project_id: projectId,
    captured_at: new Date().toISOString(),
    trigger,
    current_revenue: revenue,
    original_cost_budget: originalBudget,
    revised_cost_budget: revisedBudget,
    committed: totals.committed,
    actual: totals.actual,
    forecast_final: finalCost,
    forecast_profit: profit,
    forecast_margin: margin,
    billed,
    collected,
    ar_outstanding: ar,
    material_sale: materialSale,
    material_only_profit: matProfit,
    percent_complete: Number(project.percent_complete || 0),
  };

  if (trigger === "ledger_rebuild") {
    const { data: last } = await supabase
      .from("project_financial_snapshots")
      .select("*")
      .eq("project_id", projectId)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last) {
      const ageMs =
        Date.now() - new Date(String(last.captured_at)).getTime();
      const same =
        Number(last.forecast_final || 0) === row.forecast_final &&
        Number(last.current_revenue || 0) === Number(row.current_revenue || 0) &&
        Number(last.billed || 0) === row.billed &&
        Number(last.collected || 0) === row.collected;
      if (same && ageMs < 5 * 60 * 1000) return last;
    }
  }

  const { data, error } = await supabase
    .from("project_financial_snapshots")
    .insert(row)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}
