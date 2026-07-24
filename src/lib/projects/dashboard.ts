import { createClient } from "@/lib/supabase/server";
import { calculateLinePricing, sumPricing } from "@/lib/pricing";
import {
  ensureProjectCostLedger,
} from "@/lib/projects/cost-ledger";
import {
  categoryRollup,
  costVariance,
  currentRevenue,
  forecastFinalCost,
  forecastMargin,
  forecastMarkup,
  forecastProfit,
  materialOnlyMargin,
  materialOnlyProfit,
  originalCostBudget,
  sumLedgerRows,
} from "@/lib/projects/financials";

type Client = Awaited<ReturnType<typeof createClient>>;

export interface DashboardAlert {
  key: string;
  label: string;
  count: number;
  severity: "info" | "watch" | "critical";
  href: string;
}

export interface CategoryBreakdownRow {
  category: string;
  budget: number | null;
  committed: number;
  actual: number;
  forecastFinal: number;
  variance: number | null;
}

export interface ProjectDashboard {
  projectId: string;
  projectNumber: string;
  projectName: string;
  status: string;
  clientName: string | null;
  projectManagerName: string | null;
  startDate: string | null;
  targetCompletionDate: string | null;
  percentComplete: number;
  financialsUpdatedAt: string | null;
  dataNeedsAttention: boolean;
  dataNeedsAttentionReasons: string[];

  currentRevenue: number | null;
  originalCostBudget: number | null;
  committedCost: number;
  actualCost: number;
  forecastUncommitted: number;
  forecastFinalCost: number;
  forecastProfit: number | null;
  forecastMargin: number | null;
  forecastMarkup: number | null;
  costVariance: number | null;

  materialSale: number;
  materialForecast: number;
  materialOnlyProfit: number;
  materialOnlyMargin: number | null;

  categories: CategoryBreakdownRow[];

  openPoCount: number;
  openPoValue: number;
  bomNotOrderedCount: number;
  delayedCount: number;
  upcomingDeliveries: number;
  laborOverBudget: boolean;
  unapprovedExpenseCount: number;

  progress: {
    percentComplete: number;
    percentBudgetSpent: number | null;
    percentLaborHoursUsed: number | null;
    percentMaterialsOrdered: number | null;
    percentMaterialsReceived: number | null;
    costAheadOfProgress: boolean;
  };

  alerts: DashboardAlert[];
  ledgerSample: Array<{
    id: string;
    category: string;
    source_type: string;
    description: string | null;
    committed_amount: number;
    actual_amount: number;
    forecast_amount: number;
  }>;
}

const CLOSED_PO_STATUSES = ["closed", "cancelled"] as const;

export async function buildProjectDashboard(
  supabase: Client,
  projectId: string,
): Promise<ProjectDashboard | null> {
  await ensureProjectCostLedger(supabase, projectId);

  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, project_number, name, status, client_id, project_manager_id, material_budget, labor_budget, expense_budget, subcontractor_budget, overhead_budget, original_revenue, revenue_additions, revenue_credits, start_date, target_completion_date, percent_complete, financials_updated_at, default_override_pct, clients(name)",
    )
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return null;

  let projectManagerName: string | null = null;
  if (project.project_manager_id) {
    const { data: pm } = await supabase
      .from("user_profiles")
      .select("full_name, email")
      .eq("id", project.project_manager_id)
      .maybeSingle();
    projectManagerName = pm?.full_name || pm?.email || null;
  }

  const [
    { data: ledgerRows },
    { data: allPos },
    { data: laborEntries },
    { data: expenses },
    { data: lineItems },
  ] = await Promise.all([
    supabase.from("project_cost_ledger").select("*").eq("project_id", projectId),
    supabase
      .from("purchase_orders")
      .select("id, status, total")
      .eq("project_id", projectId),
    supabase
      .from("labor_entries")
      .select(
        "id, estimated_hours, actual_hours, total_cost, approval_status, hourly_rate",
      )
      .eq("project_id", projectId),
    supabase
      .from("project_expenses")
      .select("id, amount, tax, approval_status")
      .eq("project_id", projectId),
    supabase
      .from("line_items")
      .select(
        "id, qty, qty_ordered, qty_received, msrp, quote, override_pct, estimated_unit_cost",
      )
      .eq("project_id", projectId),
  ]);

  const ledger = ledgerRows ?? [];
  const totals = sumLedgerRows(ledger);
  const finalCost = forecastFinalCost(totals);
  const revenue = currentRevenue({
    original_revenue: project.original_revenue as number | null,
    revenue_additions: project.revenue_additions as number | null,
    revenue_credits: project.revenue_credits as number | null,
  });
  const budget = originalCostBudget({
    material_budget: project.material_budget as number | null,
    labor_budget: project.labor_budget as number | null,
    expense_budget: project.expense_budget as number | null,
    subcontractor_budget: project.subcontractor_budget as number | null,
    overhead_budget: project.overhead_budget as number | null,
  });
  const profit = forecastProfit(revenue, finalCost);
  const margin = forecastMargin(profit, revenue);
  const markup = forecastMarkup(profit, finalCost);
  const variance = costVariance(budget, finalCost);

  const defaultOverride = Number(project.default_override_pct || 0);
  const priced = (lineItems ?? []).map((line) =>
    calculateLinePricing({
      qty: line.qty,
      msrp: line.msrp,
      quote: line.quote,
      overridePct: line.override_pct,
      projectDefaultOverridePct: defaultOverride,
    }),
  );
  const materialSale = sumPricing(priced).totalSale;
  const materialForecast = ledger
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
  const matMargin = materialOnlyMargin(matProfit, materialSale);

  const categories = categoryRollup(ledger, {
    materials: project.material_budget as number | null,
    labor: project.labor_budget as number | null,
    freight: null,
    subcontractors: project.subcontractor_budget as number | null,
    travel: null,
    equipment: null,
    permits: null,
    other: project.expense_budget as number | null,
    overhead: project.overhead_budget as number | null,
  });

  const pos = allPos ?? [];
  const poIds = pos.map((p) => p.id);
  let poItems: Array<{
    item_status: string;
    qty_ordered: number;
    qty_received: number;
    expected_delivery_date: string | null;
  }> = [];
  if (poIds.length) {
    const { data } = await supabase
      .from("purchase_order_items")
      .select("item_status, qty_ordered, qty_received, expected_delivery_date")
      .in("po_id", poIds);
    poItems = data ?? [];
  }

  const openPos = pos.filter(
    (po) => !CLOSED_PO_STATUSES.includes(po.status as "closed" | "cancelled"),
  );
  const openPoCount = openPos.length;
  const openPoValue = openPos.reduce((s, po) => s + Number(po.total ?? 0), 0);

  const bomNotOrderedCount = (lineItems ?? []).filter(
    (li) => Number(li.qty_ordered ?? 0) < Number(li.qty ?? 0),
  ).length;

  const delayedCount = poItems.filter(
    (item) =>
      item.item_status === "delayed" || item.item_status === "backordered",
  ).length;

  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  const sevenDaysStr = sevenDaysFromNow.toISOString().slice(0, 10);
  const todayStr = new Date().toISOString().slice(0, 10);

  const upcomingDeliveries = poItems.filter((item) => {
    if (!item.expected_delivery_date) return false;
    const d = item.expected_delivery_date.slice(0, 10);
    return (
      d >= todayStr &&
      d <= sevenDaysStr &&
      item.item_status !== "received" &&
      item.item_status !== "cancelled"
    );
  }).length;

  const laborBudget = project.labor_budget != null ? Number(project.labor_budget) : null;
  const laborActualApproved = (laborEntries ?? [])
    .filter((e) => e.approval_status === "approved")
    .reduce((s, e) => s + Number(e.total_cost || 0), 0);
  const laborOverBudget =
    laborBudget != null && laborActualApproved > laborBudget;

  const unapprovedExpenseCount = (expenses ?? []).filter(
    (e) => e.approval_status === "pending" || e.approval_status === "submitted",
  ).length;

  const totalQty = (lineItems ?? []).reduce((s, l) => s + Number(l.qty || 0), 0);
  const orderedQty = (lineItems ?? []).reduce(
    (s, l) => s + Number(l.qty_ordered || 0),
    0,
  );
  const receivedQty = (lineItems ?? []).reduce(
    (s, l) => s + Number(l.qty_received || 0),
    0,
  );
  const estHours = (laborEntries ?? []).reduce(
    (s, e) => s + Number(e.estimated_hours || 0),
    0,
  );
  const actHours = (laborEntries ?? []).reduce(
    (s, e) => s + Number(e.actual_hours || 0),
    0,
  );

  const percentComplete = Number(project.percent_complete || 0);
  const percentBudgetSpent =
    budget != null && budget > 0 ? (finalCost / budget) * 100 : null;
  const percentLaborHoursUsed =
    estHours > 0 ? Math.min(100, (actHours / estHours) * 100) : null;
  const percentMaterialsOrdered =
    totalQty > 0 ? Math.min(100, (orderedQty / totalQty) * 100) : null;
  const percentMaterialsReceived =
    totalQty > 0 ? Math.min(100, (receivedQty / totalQty) * 100) : null;
  const costAheadOfProgress =
    percentBudgetSpent != null &&
    percentBudgetSpent > percentComplete + 15;

  const reasons: string[] = [];
  if (revenue == null) reasons.push("Original contract revenue not set");
  if (budget == null) reasons.push("No cost budgets set");
  const dataNeedsAttention = reasons.length > 0;

  const base = `/projects/${projectId}`;
  const alerts: DashboardAlert[] = [];

  if (dataNeedsAttention) {
    alerts.push({
      key: "data",
      label: "Data needs attention",
      count: reasons.length,
      severity: "watch",
      href: base,
    });
  }
  if (delayedCount > 0) {
    alerts.push({
      key: "delayed",
      label: "Delayed / backordered items",
      count: delayedCount,
      severity: "critical",
      href: `${base}/tracking?filter=delayed`,
    });
  }
  if (bomNotOrderedCount > 0) {
    alerts.push({
      key: "not_ordered",
      label: "BOM items not ordered",
      count: bomNotOrderedCount,
      severity: "watch",
      href: `${base}/procurement`,
    });
  }
  if (upcomingDeliveries > 0) {
    alerts.push({
      key: "upcoming",
      label: "Deliveries in next 7 days",
      count: upcomingDeliveries,
      severity: "info",
      href: `${base}/tracking`,
    });
  }
  if (laborOverBudget) {
    alerts.push({
      key: "labor_over",
      label: "Labor over budget",
      count: 1,
      severity: "critical",
      href: `${base}/labor`,
    });
  }
  if (unapprovedExpenseCount > 0) {
    alerts.push({
      key: "expenses_pending",
      label: "Unapproved expenses",
      count: unapprovedExpenseCount,
      severity: "watch",
      href: `${base}/expenses`,
    });
  }
  if (profit != null && profit < 0) {
    alerts.push({
      key: "neg_profit",
      label: "Negative forecast profit",
      count: 1,
      severity: "critical",
      href: `${base}/dashboard`,
    });
  }
  if (openPoCount > 0) {
    alerts.push({
      key: "open_pos",
      label: "Open purchase orders",
      count: openPoCount,
      severity: "info",
      href: `${base}/procurement`,
    });
  }

  const ledgerSample = ledger.slice(0, 40).map((r) => ({
    id: String(r.id),
    category: String(r.category),
    source_type: String(r.source_type),
    description: (r.description as string | null) ?? null,
    committed_amount: Number(r.committed_amount || 0),
    actual_amount: Number(r.actual_amount || 0),
    forecast_amount: Number(r.forecast_amount || 0),
  }));

  return {
    projectId: project.id,
    projectNumber: project.project_number,
    projectName: project.name,
    status: project.status,
    clientName:
      (project.clients as { name?: string } | null)?.name ?? null,
    projectManagerName,
    startDate: (project.start_date as string | null) ?? null,
    targetCompletionDate:
      (project.target_completion_date as string | null) ?? null,
    percentComplete,
    financialsUpdatedAt:
      (project.financials_updated_at as string | null) ?? null,
    dataNeedsAttention,
    dataNeedsAttentionReasons: reasons,
    currentRevenue: revenue,
    originalCostBudget: budget,
    committedCost: totals.committed,
    actualCost: totals.actual,
    forecastUncommitted: totals.forecast,
    forecastFinalCost: finalCost,
    forecastProfit: profit,
    forecastMargin: margin,
    forecastMarkup: markup,
    costVariance: variance,
    materialSale,
    materialForecast,
    materialOnlyProfit: matProfit,
    materialOnlyMargin: matMargin,
    categories,
    openPoCount,
    openPoValue,
    bomNotOrderedCount,
    delayedCount,
    upcomingDeliveries,
    laborOverBudget,
    unapprovedExpenseCount,
    progress: {
      percentComplete,
      percentBudgetSpent,
      percentLaborHoursUsed,
      percentMaterialsOrdered,
      percentMaterialsReceived,
      costAheadOfProgress,
    },
    alerts,
    ledgerSample,
  };
}
