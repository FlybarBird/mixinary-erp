import { createClient } from "@/lib/supabase/server";
import { calculateLinePricing, sumPricing } from "@/lib/pricing";
import { ensureProjectCostLedger } from "@/lib/projects/cost-ledger";
import { buildDuplicateCostAlerts } from "@/lib/projects/duplicate-alerts";
import {
  arOutstanding,
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
  revenueBreakdown,
  revisedBudgetBuckets,
  revisedCostBudget,
  sumLedgerRows,
  totalBilled,
  totalCollected,
  unbilledContractValue,
} from "@/lib/projects/financials";

type Client = Awaited<ReturnType<typeof createClient>>;

export interface DashboardAlert {
  key: string;
  label: string;
  count: number;
  severity: "info" | "watch" | "critical";
  href: string;
  detail?: string;
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
  revenueBreakdown: {
    original: number | null;
    approvedChangeOrders: number;
    manualAdjustments: number;
    current: number | null;
  };
  originalCostBudget: number | null;
  revisedCostBudget: number | null;
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

  billed: number;
  collected: number;
  arOutstanding: number;
  unbilled: number | null;

  apUnpaid: number;
  receivedNotBilledEstimate: number;
  pendingChangeOrderCount: number;
  laborBillableValue: number;

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
  duplicateAlerts: Array<{
    key: string;
    label: string;
    detail: string;
    severity: "watch" | "critical";
    href: string;
  }>;
  snapshots: Array<{
    id: string;
    captured_at: string;
    trigger: string;
    current_revenue: number | null;
    forecast_final: number;
    forecast_profit: number | null;
    billed: number;
    collected: number;
    ar_outstanding: number;
  }>;
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
    { data: changeOrders },
    { data: invoices },
    { data: payments },
    { data: vendorBills },
    { data: snapshots },
  ] = await Promise.all([
    supabase.from("project_cost_ledger").select("*").eq("project_id", projectId),
    supabase
      .from("purchase_orders")
      .select("id, status, total")
      .eq("project_id", projectId),
    supabase
      .from("labor_entries")
      .select(
        "id, estimated_hours, actual_hours, total_cost, approval_status, hourly_rate, billing_rate, worker_name, work_date",
      )
      .eq("project_id", projectId),
    supabase
      .from("project_expenses")
      .select("id, amount, tax, approval_status, payee, expense_date, description, po_id")
      .eq("project_id", projectId),
    supabase
      .from("line_items")
      .select(
        "id, qty, qty_ordered, qty_received, msrp, quote, override_pct, estimated_unit_cost",
      )
      .eq("project_id", projectId),
    supabase
      .from("project_change_orders")
      .select(
        "id, status, revenue_delta, budget_material_delta, budget_labor_delta, budget_expense_delta, budget_subcontractor_delta, budget_overhead_delta",
      )
      .eq("project_id", projectId),
    supabase
      .from("project_invoices")
      .select("id, status, total, amount_paid, due_date")
      .eq("project_id", projectId),
    supabase
      .from("project_payments")
      .select("id, amount")
      .eq("project_id", projectId),
    supabase
      .from("vendor_bills")
      .select("id, amount, amount_paid, status, purchase_order_id")
      .eq("project_id", projectId),
    supabase
      .from("project_financial_snapshots")
      .select(
        "id, captured_at, trigger, current_revenue, forecast_final, forecast_profit, billed, collected, ar_outstanding",
      )
      .eq("project_id", projectId)
      .order("captured_at", { ascending: false })
      .limit(24),
  ]);

  const cos = changeOrders ?? [];
  const ledger = ledgerRows ?? [];
  const totals = sumLedgerRows(ledger);
  const finalCost = forecastFinalCost(totals);
  const revenueFields = {
    original_revenue: project.original_revenue as number | null,
    revenue_additions: project.revenue_additions as number | null,
    revenue_credits: project.revenue_credits as number | null,
  };
  const revenue = currentRevenue(revenueFields, cos);
  const breakdown = revenueBreakdown(revenueFields, cos);
  const buckets = {
    material_budget: project.material_budget as number | null,
    labor_budget: project.labor_budget as number | null,
    expense_budget: project.expense_budget as number | null,
    subcontractor_budget: project.subcontractor_budget as number | null,
    overhead_budget: project.overhead_budget as number | null,
  };
  const budget = originalCostBudget(buckets);
  const revisedBudget = revisedCostBudget(buckets, cos);
  const revisedBuckets = revisedBudgetBuckets(buckets, cos);
  const profit = forecastProfit(revenue, finalCost);
  const margin = forecastMargin(profit, revenue);
  const markup = forecastMarkup(profit, finalCost);
  const variance = costVariance(revisedBudget ?? budget, finalCost);

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
    materials: revisedBuckets.material_budget,
    labor: revisedBuckets.labor_budget,
    freight: null,
    subcontractors: revisedBuckets.subcontractor_budget,
    travel: null,
    equipment: null,
    permits: null,
    other: revisedBuckets.expense_budget,
    overhead: revisedBuckets.overhead_budget,
  });

  const billed = totalBilled(invoices ?? []);
  const collected = totalCollected(payments ?? []);
  const ar = arOutstanding(billed, collected);
  const unbilled = unbilledContractValue(revenue, billed);

  const apUnpaid = (vendorBills ?? [])
    .filter((b) => b.status !== "void")
    .reduce(
      (s, b) => s + Math.max(0, Number(b.amount || 0) - Number(b.amount_paid || 0)),
      0,
    );
  const billedPoIds = new Set(
    (vendorBills ?? [])
      .filter((b) => b.purchase_order_id && b.status !== "void" && b.status !== "accrued")
      .map((b) => b.purchase_order_id as string),
  );
  // Rough "received not billed": open POs without a non-accrued vendor bill
  const receivedNotBilledEstimate = (allPos ?? [])
    .filter(
      (po) =>
        !CLOSED_PO_STATUSES.includes(po.status as "closed" | "cancelled") &&
        !billedPoIds.has(po.id),
    )
    .reduce((s, po) => s + Number(po.total || 0), 0);

  const pendingChangeOrderCount = cos.filter(
    (c) => c.status === "submitted",
  ).length;

  const laborBillableValue = (laborEntries ?? [])
    .filter((e) => e.approval_status === "approved")
    .reduce(
      (s, e) =>
        s + Number(e.actual_hours || 0) * Number(e.billing_rate || 0),
      0,
    );

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

  const laborBudget =
    revisedBuckets.labor_budget != null
      ? Number(revisedBuckets.labor_budget)
      : null;
  const laborActualApproved = ledger
    .filter((r) => r.category === "labor")
    .reduce((s, r) => s + Number(r.actual_amount || 0), 0);
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
  const budgetForProgress = revisedBudget ?? budget;
  const percentBudgetSpent =
    budgetForProgress != null && budgetForProgress > 0
      ? (finalCost / budgetForProgress) * 100
      : null;
  const percentLaborHoursUsed =
    estHours > 0 ? Math.min(100, (actHours / estHours) * 100) : null;
  const percentMaterialsOrdered =
    totalQty > 0 ? Math.min(100, (orderedQty / totalQty) * 100) : null;
  const percentMaterialsReceived =
    totalQty > 0 ? Math.min(100, (receivedQty / totalQty) * 100) : null;
  const costAheadOfProgress =
    percentBudgetSpent != null && percentBudgetSpent > percentComplete + 15;

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
  if (pendingChangeOrderCount > 0) {
    alerts.push({
      key: "pending_cos",
      label: "Pending change orders",
      count: pendingChangeOrderCount,
      severity: "watch",
      href: `${base}/change-orders`,
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
  if (unbilled != null && revenue != null && revenue > 0) {
    const billedPct = (billed / revenue) * 100;
    if (percentComplete > billedPct + 20 && unbilled > 0) {
      alerts.push({
        key: "unbilled",
        label: "Unbilled vs % complete",
        count: 1,
        severity: "watch",
        href: `${base}/billing`,
        detail: `Unbilled ${unbilled.toFixed(0)} with progress ahead of billing`,
      });
    }
  }
  const pastDueAr = (invoices ?? []).filter((inv) => {
    if (!["sent", "partially_paid"].includes(String(inv.status))) return false;
    if (!inv.due_date) return false;
    const open = Number(inv.total || 0) - Number(inv.amount_paid || 0);
    return open > 0 && String(inv.due_date).slice(0, 10) < todayStr;
  }).length;
  if (pastDueAr > 0) {
    alerts.push({
      key: "ar_past_due",
      label: "AR past due",
      count: pastDueAr,
      severity: "critical",
      href: `${base}/billing`,
    });
  }
  if (apUnpaid > 0) {
    alerts.push({
      key: "ap_unpaid",
      label: "Vendor AP unpaid",
      count: 1,
      severity: "watch",
      href: `${base}/billing#ap`,
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

  // CO vs manual overlap heuristic
  const manual = Number(project.revenue_additions || 0);
  if (manual > 0) {
    const approvedCo = cos
      .filter((c) => c.status === "approved")
      .find((c) => Math.abs(Number(c.revenue_delta || 0) - manual) < 1);
    if (approvedCo) {
      alerts.push({
        key: "co-manual-overlap",
        label: "CO vs manual addition overlap",
        count: 1,
        severity: "watch",
        href: `${base}/change-orders`,
        detail: "Manual revenue addition close to an approved CO amount",
      });
    }
  }

  let duplicateAlerts: ProjectDashboard["duplicateAlerts"] = [];
  try {
    duplicateAlerts = await buildDuplicateCostAlerts(supabase, projectId);
  } catch {
    duplicateAlerts = [];
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
    revenueBreakdown: breakdown,
    originalCostBudget: budget,
    revisedCostBudget: revisedBudget,
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
    billed,
    collected,
    arOutstanding: ar,
    unbilled,
    apUnpaid,
    receivedNotBilledEstimate,
    pendingChangeOrderCount,
    laborBillableValue,
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
    duplicateAlerts,
    snapshots: (snapshots ?? []).map((s) => ({
      id: String(s.id),
      captured_at: String(s.captured_at),
      trigger: String(s.trigger),
      current_revenue:
        s.current_revenue == null ? null : Number(s.current_revenue),
      forecast_final: Number(s.forecast_final || 0),
      forecast_profit:
        s.forecast_profit == null ? null : Number(s.forecast_profit),
      billed: Number(s.billed || 0),
      collected: Number(s.collected || 0),
      ar_outstanding: Number(s.ar_outstanding || 0),
    })),
    ledgerSample,
  };
}
