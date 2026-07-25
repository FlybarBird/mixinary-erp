/**
 * Canonical project financial formulas (Phase 1–6).
 * Margin = profit / revenue. Markup = profit / cost. They are not the same.
 * Billing (billed/collected/AR) is separate from contract Current Revenue.
 */

export type BudgetBuckets = {
  material_budget?: number | null;
  labor_budget?: number | null;
  expense_budget?: number | null;
  subcontractor_budget?: number | null;
  overhead_budget?: number | null;
};

export type RevenueFields = {
  original_revenue?: number | null;
  revenue_additions?: number | null;
  revenue_credits?: number | null;
};

export type ApprovedChangeOrder = {
  status?: string | null;
  revenue_delta?: number | null;
  budget_material_delta?: number | null;
  budget_labor_delta?: number | null;
  budget_expense_delta?: number | null;
  budget_subcontractor_delta?: number | null;
  budget_overhead_delta?: number | null;
};

export type LedgerTotals = {
  committed: number;
  actual: number;
  forecast: number;
};

function n(value: number | null | undefined): number {
  if (value == null || Number.isNaN(Number(value))) return 0;
  return Number(value);
}

export function manualRevenueAdjustment(fields: RevenueFields): number {
  return n(fields.revenue_additions) - n(fields.revenue_credits);
}

export function approvedChangeOrderRevenue(
  changeOrders: ApprovedChangeOrder[],
): number {
  return changeOrders
    .filter((co) => co.status === "approved")
    .reduce((sum, co) => sum + n(co.revenue_delta), 0);
}

/**
 * Current Revenue = original + approved CO deltas + manual additions − credits.
 * Null original → null (needs attention).
 */
export function currentRevenue(
  fields: RevenueFields,
  changeOrders: ApprovedChangeOrder[] = [],
): number | null {
  if (fields.original_revenue == null || fields.original_revenue === undefined) {
    return null;
  }
  return (
    n(fields.original_revenue) +
    approvedChangeOrderRevenue(changeOrders) +
    manualRevenueAdjustment(fields)
  );
}

export function revenueBreakdown(
  fields: RevenueFields,
  changeOrders: ApprovedChangeOrder[] = [],
) {
  const original =
    fields.original_revenue == null ? null : n(fields.original_revenue);
  const approvedCos = approvedChangeOrderRevenue(changeOrders);
  const manual = manualRevenueAdjustment(fields);
  return {
    original,
    approvedChangeOrders: approvedCos,
    manualAdjustments: manual,
    current: currentRevenue(fields, changeOrders),
  };
}

/** Sum of budget buckets. Returns null when no bucket is set. */
export function originalCostBudget(buckets: BudgetBuckets): number | null {
  const keys: (keyof BudgetBuckets)[] = [
    "material_budget",
    "labor_budget",
    "expense_budget",
    "subcontractor_budget",
    "overhead_budget",
  ];
  const anySet = keys.some(
    (k) => buckets[k] != null && buckets[k] !== undefined,
  );
  if (!anySet) return null;
  return keys.reduce((sum, k) => sum + n(buckets[k]), 0);
}

export function approvedChangeOrderBudgetDeltas(
  changeOrders: ApprovedChangeOrder[],
): BudgetBuckets {
  const approved = changeOrders.filter((co) => co.status === "approved");
  return {
    material_budget: approved.reduce(
      (s, co) => s + n(co.budget_material_delta),
      0,
    ),
    labor_budget: approved.reduce((s, co) => s + n(co.budget_labor_delta), 0),
    expense_budget: approved.reduce(
      (s, co) => s + n(co.budget_expense_delta),
      0,
    ),
    subcontractor_budget: approved.reduce(
      (s, co) => s + n(co.budget_subcontractor_delta),
      0,
    ),
    overhead_budget: approved.reduce(
      (s, co) => s + n(co.budget_overhead_delta),
      0,
    ),
  };
}

/** Revised budget = original buckets + approved CO budget deltas. */
export function revisedCostBudget(
  buckets: BudgetBuckets,
  changeOrders: ApprovedChangeOrder[] = [],
): number | null {
  const base = originalCostBudget(buckets);
  const deltas = approvedChangeOrderBudgetDeltas(changeOrders);
  const deltaSum =
    n(deltas.material_budget) +
    n(deltas.labor_budget) +
    n(deltas.expense_budget) +
    n(deltas.subcontractor_budget) +
    n(deltas.overhead_budget);
  if (base == null && deltaSum === 0) return null;
  return n(base) + deltaSum;
}

export function revisedBudgetBuckets(
  buckets: BudgetBuckets,
  changeOrders: ApprovedChangeOrder[] = [],
): BudgetBuckets {
  const deltas = approvedChangeOrderBudgetDeltas(changeOrders);
  const add = (
    base: number | null | undefined,
    delta: number | null | undefined,
  ) => {
    if (base == null && !n(delta)) return base ?? null;
    return n(base) + n(delta);
  };
  return {
    material_budget: add(buckets.material_budget, deltas.material_budget),
    labor_budget: add(buckets.labor_budget, deltas.labor_budget),
    expense_budget: add(buckets.expense_budget, deltas.expense_budget),
    subcontractor_budget: add(
      buckets.subcontractor_budget,
      deltas.subcontractor_budget,
    ),
    overhead_budget: add(buckets.overhead_budget, deltas.overhead_budget),
  };
}

export function forecastFinalCost(totals: LedgerTotals): number {
  return n(totals.actual) + n(totals.committed) + n(totals.forecast);
}

export function forecastProfit(
  revenue: number | null,
  finalCost: number,
): number | null {
  if (revenue == null) return null;
  return revenue - finalCost;
}

/** Margin = profit ÷ revenue (fraction). */
export function forecastMargin(
  profit: number | null,
  revenue: number | null,
): number | null {
  if (profit == null || revenue == null || revenue <= 0) return null;
  return profit / revenue;
}

/** Markup = profit ÷ cost (fraction). */
export function forecastMarkup(
  profit: number | null,
  finalCost: number,
): number | null {
  if (profit == null || finalCost <= 0) return null;
  return profit / finalCost;
}

/** Cost variance = budget − forecast final (positive = under budget). */
export function costVariance(
  budget: number | null,
  finalCost: number,
): number | null {
  if (budget == null) return null;
  return budget - finalCost;
}

export function materialOnlyProfit(
  materialSale: number,
  materialForecast: number,
): number {
  return materialSale - materialForecast;
}

export function materialOnlyMargin(
  profit: number,
  materialSale: number,
): number | null {
  if (materialSale <= 0) return null;
  return profit / materialSale;
}

export function sumLedgerRows(
  rows: Array<{
    committed_amount?: number | null;
    actual_amount?: number | null;
    forecast_amount?: number | null;
  }>,
): LedgerTotals {
  return rows.reduce(
    (acc, row) => ({
      committed: acc.committed + n(row.committed_amount),
      actual: acc.actual + n(row.actual_amount),
      forecast: acc.forecast + n(row.forecast_amount),
    }),
    { committed: 0, actual: 0, forecast: 0 },
  );
}

export function categoryRollup(
  rows: Array<{
    category?: string | null;
    committed_amount?: number | null;
    actual_amount?: number | null;
    forecast_amount?: number | null;
    budget_amount?: number | null;
  }>,
  budgetsByCategory: Record<string, number | null | undefined>,
) {
  const cats = [
    "materials",
    "labor",
    "freight",
    "subcontractors",
    "travel",
    "equipment",
    "permits",
    "other",
    "overhead",
  ] as const;

  const map = new Map<
    string,
    { committed: number; actual: number; forecast: number; budget: number }
  >();
  for (const c of cats) {
    map.set(c, {
      committed: 0,
      actual: 0,
      forecast: 0,
      budget: n(budgetsByCategory[c]),
    });
  }

  for (const row of rows) {
    const key = String(row.category || "other");
    if (!map.has(key)) {
      map.set(key, { committed: 0, actual: 0, forecast: 0, budget: 0 });
    }
    const bucket = map.get(key)!;
    bucket.committed += n(row.committed_amount);
    bucket.actual += n(row.actual_amount);
    bucket.forecast += n(row.forecast_amount);
    if (n(row.budget_amount) > 0) {
      bucket.budget += n(row.budget_amount);
    }
  }

  return cats.map((category) => {
    const b = map.get(category)!;
    const final = b.actual + b.committed + b.forecast;
    const budget =
      budgetsByCategory[category] != null
        ? n(budgetsByCategory[category])
        : b.budget || null;
    return {
      category,
      budget,
      committed: b.committed,
      actual: b.actual,
      forecastFinal: final,
      variance: budget == null ? null : budget - final,
    };
  });
}

/** Phase 4 billing helpers — not contract revenue. */
export function totalBilled(
  invoices: Array<{ status?: string | null; total?: number | null }>,
): number {
  return invoices
    .filter((inv) =>
      ["sent", "partially_paid", "paid"].includes(String(inv.status || "")),
    )
    .reduce((s, inv) => s + n(inv.total), 0);
}

export function totalCollected(
  payments: Array<{ amount?: number | null }>,
): number {
  return payments.reduce((s, p) => s + n(p.amount), 0);
}

export function arOutstanding(billed: number, collected: number): number {
  return Math.max(0, billed - collected);
}

export function unbilledContractValue(
  revenue: number | null,
  billed: number,
): number | null {
  if (revenue == null) return null;
  return Math.max(0, revenue - billed);
}

export function burdenedLaborCost(
  hours: number,
  hourlyRate: number,
  burdenPct: number,
): number {
  return n(hours) * n(hourlyRate) * (1 + n(burdenPct));
}

export function billableLaborValue(hours: number, billingRate: number): number {
  return n(hours) * n(billingRate);
}

/** Cash paid out = vendor AP paid + paid expenses + paid sub bills. */
export function cashPaidOut(parts: {
  vendorPaid?: number | null;
  expensesPaid?: number | null;
  subcontractPaid?: number | null;
}): number {
  return n(parts.vendorPaid) + n(parts.expensesPaid) + n(parts.subcontractPaid);
}

/** Cash Position = Collected − Cash Paid Out (not accounting profit). */
export function cashPosition(collected: number, paidOut: number): number {
  return n(collected) - n(paidOut);
}

export function percentOf(part: number, whole: number | null): number | null {
  if (whole == null || whole <= 0) return null;
  return (n(part) / whole) * 100;
}

/** Estimated CO cost = sum of budget deltas (material/labor/expense/sub/overhead). */
export function changeOrderEstimatedCost(co: ApprovedChangeOrder): number {
  return (
    n(co.budget_material_delta) +
    n(co.budget_labor_delta) +
    n(co.budget_expense_delta) +
    n(co.budget_subcontractor_delta) +
    n(co.budget_overhead_delta)
  );
}

export function changeOrderEstimatedProfit(co: ApprovedChangeOrder): number {
  return n(co.revenue_delta) - changeOrderEstimatedCost(co);
}

export function changeOrderEstimatedMargin(co: ApprovedChangeOrder): number | null {
  const rev = n(co.revenue_delta);
  if (rev <= 0) return null;
  return changeOrderEstimatedProfit(co) / rev;
}

export type ProfitWaterfallStep = {
  key: string;
  label: string;
  amount: number;
  running: number;
};

/**
 * Original contract profit → CO profit impact → cost variance vs original budget
 * → Forecast Profit. Amounts are signed contributions to the running total.
 */
export function profitWaterfall(params: {
  originalRevenue: number | null;
  originalBudget: number | null;
  approvedCoRevenue: number;
  approvedCoBudgetDelta: number;
  forecastFinalCost: number;
  forecastProfit: number | null;
}): ProfitWaterfallStep[] {
  const originalRev = params.originalRevenue;
  const originalBudget = params.originalBudget;
  const originalProfit =
    originalRev == null || originalBudget == null
      ? null
      : originalRev - originalBudget;

  const steps: ProfitWaterfallStep[] = [];
  let running = n(originalProfit);

  steps.push({
    key: "original",
    label: "Original contract profit",
    amount: n(originalProfit),
    running,
  });

  const coProfitImpact =
    n(params.approvedCoRevenue) - n(params.approvedCoBudgetDelta);
  running += coProfitImpact;
  steps.push({
    key: "co_impact",
    label: "Approved CO profit impact",
    amount: coProfitImpact,
    running,
  });

  // Cost variance vs revised budget: budget − forecast (positive = under)
  const revisedBudget =
    originalBudget == null && !params.approvedCoBudgetDelta
      ? null
      : n(originalBudget) + n(params.approvedCoBudgetDelta);
  const costVar =
    revisedBudget == null
      ? 0
      : revisedBudget - n(params.forecastFinalCost);
  running += costVar;
  steps.push({
    key: "cost_variance",
    label: "Cost variance vs revised budget",
    amount: costVar,
    running,
  });

  const forecast =
    params.forecastProfit == null ? running : n(params.forecastProfit);
  steps.push({
    key: "forecast",
    label: "Forecast profit",
    amount: forecast,
    running: forecast,
  });

  return steps;
}
