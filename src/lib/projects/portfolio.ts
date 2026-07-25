import { createClient } from "@/lib/supabase/server";
import { ensureProjectCostLedger } from "@/lib/projects/cost-ledger";
import {
  arOutstanding,
  currentRevenue,
  forecastFinalCost,
  forecastMargin,
  forecastProfit,
  originalCostBudget,
  revisedCostBudget,
  sumLedgerRows,
  totalBilled,
  totalCollected,
  unbilledContractValue,
} from "@/lib/projects/financials";

type Client = Awaited<ReturnType<typeof createClient>>;

export type PortfolioRow = {
  projectId: string;
  projectNumber: string;
  projectName: string;
  clientName: string | null;
  projectManagerName: string | null;
  status: string;
  percentComplete: number;
  currentRevenue: number | null;
  forecastFinalCost: number;
  forecastProfit: number | null;
  forecastMargin: number | null;
  costVariance: number | null;
  billed: number;
  collected: number;
  arOutstanding: number;
  unbilled: number | null;
  dataNeedsAttention: boolean;
};

export async function buildPortfolioRows(
  supabase: Client,
  projectIds?: string[],
): Promise<PortfolioRow[]> {
  let query = supabase
    .from("projects")
    .select(
      "id, project_number, name, status, project_manager_id, percent_complete, original_revenue, revenue_additions, revenue_credits, material_budget, labor_budget, expense_budget, subcontractor_budget, overhead_budget, clients(name)",
    )
    .neq("status", "archived")
    .order("project_number");
  if (projectIds?.length) query = query.in("id", projectIds);
  const { data: projects } = await query;
  if (!projects?.length) return [];

  const ids = projects.map((p) => p.id);
  const [
    { data: changeOrders },
    { data: ledger },
    { data: invoices },
    { data: payments },
    { data: managers },
  ] = await Promise.all([
    supabase
      .from("project_change_orders")
      .select(
        "project_id, status, revenue_delta, budget_material_delta, budget_labor_delta, budget_expense_delta, budget_subcontractor_delta, budget_overhead_delta",
      )
      .in("project_id", ids),
    supabase
      .from("project_cost_ledger")
      .select(
        "project_id, committed_amount, actual_amount, forecast_amount",
      )
      .in("project_id", ids),
    supabase
      .from("project_invoices")
      .select("project_id, status, total")
      .in("project_id", ids),
    supabase
      .from("project_payments")
      .select("project_id, amount")
      .in("project_id", ids),
    supabase.from("user_profiles").select("id, full_name, email"),
  ]);

  // Ensure ledger exists for projects missing rows (lazy)
  const haveLedger = new Set((ledger ?? []).map((r) => r.project_id));
  for (const id of ids) {
    if (!haveLedger.has(id)) {
      try {
        await ensureProjectCostLedger(supabase, id);
      } catch {
        // ignore
      }
    }
  }
  const { data: ledgerFresh } = haveLedger.size < ids.length
    ? await supabase
        .from("project_cost_ledger")
        .select(
          "project_id, committed_amount, actual_amount, forecast_amount",
        )
        .in("project_id", ids)
    : { data: ledger };

  const pmMap = new Map(
    (managers ?? []).map((m) => [m.id, m.full_name || m.email || null]),
  );

  const cosByProject = new Map<string, typeof changeOrders>();
  for (const co of changeOrders ?? []) {
    const list = cosByProject.get(co.project_id) ?? [];
    list.push(co);
    cosByProject.set(co.project_id, list);
  }
  const ledgerByProject = new Map<string, NonNullable<typeof ledgerFresh>>();
  for (const row of ledgerFresh ?? []) {
    const list = ledgerByProject.get(row.project_id) ?? [];
    list.push(row);
    ledgerByProject.set(row.project_id, list);
  }
  const invByProject = new Map<string, NonNullable<typeof invoices>>();
  for (const inv of invoices ?? []) {
    const list = invByProject.get(inv.project_id) ?? [];
    list.push(inv);
    invByProject.set(inv.project_id, list);
  }
  const payByProject = new Map<string, NonNullable<typeof payments>>();
  for (const p of payments ?? []) {
    const list = payByProject.get(p.project_id) ?? [];
    list.push(p);
    payByProject.set(p.project_id, list);
  }

  return projects.map((project) => {
    const cos = cosByProject.get(project.id) ?? [];
    const totals = sumLedgerRows(ledgerByProject.get(project.id) ?? []);
    const finalCost = forecastFinalCost(totals);
    const buckets = {
      material_budget: project.material_budget as number | null,
      labor_budget: project.labor_budget as number | null,
      expense_budget: project.expense_budget as number | null,
      subcontractor_budget: project.subcontractor_budget as number | null,
      overhead_budget: project.overhead_budget as number | null,
    };
    const revenue = currentRevenue(
      {
        original_revenue: project.original_revenue as number | null,
        revenue_additions: project.revenue_additions as number | null,
        revenue_credits: project.revenue_credits as number | null,
      },
      cos,
    );
    const revised = revisedCostBudget(buckets, cos);
    const original = originalCostBudget(buckets);
    const budgetForVariance = revised ?? original;
    const profit = forecastProfit(revenue, finalCost);
    const margin = forecastMargin(profit, revenue);
    const billed = totalBilled(invByProject.get(project.id) ?? []);
    const collected = totalCollected(payByProject.get(project.id) ?? []);
    const ar = arOutstanding(billed, collected);
    const unbilled = unbilledContractValue(revenue, billed);
    return {
      projectId: project.id,
      projectNumber: project.project_number,
      projectName: project.name,
      clientName:
        (project.clients as { name?: string } | null)?.name ?? null,
      projectManagerName: project.project_manager_id
        ? pmMap.get(project.project_manager_id) ?? null
        : null,
      status: project.status,
      percentComplete: Number(project.percent_complete || 0),
      currentRevenue: revenue,
      forecastFinalCost: finalCost,
      forecastProfit: profit,
      forecastMargin: margin,
      costVariance:
        budgetForVariance == null ? null : budgetForVariance - finalCost,
      billed,
      collected,
      arOutstanding: ar,
      unbilled,
      dataNeedsAttention: revenue == null || original == null,
    };
  });
}
