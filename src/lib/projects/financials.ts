/**
 * Canonical project financial formulas (Phase 1–2).
 * Margin = profit / revenue. Markup = profit / cost. They are not the same.
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

export type LedgerTotals = {
  committed: number;
  actual: number;
  forecast: number;
};

function n(value: number | null | undefined): number {
  if (value == null || Number.isNaN(Number(value))) return 0;
  return Number(value);
}

/** Current Revenue = original + additions − credits. Null original → null (needs attention). */
export function currentRevenue(fields: RevenueFields): number | null {
  if (fields.original_revenue == null || fields.original_revenue === undefined) {
    return null;
  }
  return (
    n(fields.original_revenue) +
    n(fields.revenue_additions) -
    n(fields.revenue_credits)
  );
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

export function forecastFinalCost(totals: LedgerTotals): number {
  // forecast_amount on ledger rows is the remaining uncommitted estimate;
  // committed is remaining obligation; actual is incurred.
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

/** Cost variance = original budget − forecast final (positive = under budget). */
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
    // Prefer explicit budget posts on ledger when present
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
