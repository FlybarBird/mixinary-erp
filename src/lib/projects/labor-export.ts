import { calculateLinePricing } from "@/lib/pricing";
import type { LaborEntry, LaborRateType, LinePricing } from "@/lib/types";

export const LABOR_EXPORT_BASE_HEADERS = [
  "Item",
  "Notes",
  "Qty",
] as const;

export const LABOR_EXPORT_RATE_HEADERS = [
  "EST",
  "Total EST",
  "Quote",
  "Total Quote",
  "Override %",
  "Sale",
  "Total Sale",
  "Profit",
] as const;

export const LABOR_EXPORT_TAIL_HEADERS = ["Status", "Sort"] as const;

/** @deprecated kept for older callers */
export function normalizeLaborRateType(value: unknown): LaborRateType {
  return value === "flat" ? "flat" : "hourly";
}

export function laborQty(entry: Pick<LaborEntry, "qty"> | null | undefined) {
  const q = Number(entry?.qty ?? 0);
  return q > 0 ? q : 1;
}

export function laborMsrp(
  entry: Pick<LaborEntry, "msrp" | "hourly_rate"> | null | undefined,
) {
  const msrp = Number(entry?.msrp ?? 0);
  if (msrp > 0) return msrp;
  return Number(entry?.hourly_rate ?? 0) || 0;
}

export function laborLinePricing(
  entry: Pick<
    LaborEntry,
    "qty" | "msrp" | "quote" | "override_pct" | "hourly_rate"
  >,
  projectDefaultOverridePct?: number | null,
): LinePricing {
  return calculateLinePricing({
    qty: laborQty(entry),
    msrp: laborMsrp(entry),
    quote: entry.quote,
    overridePct: entry.override_pct,
    projectDefaultOverridePct,
  });
}

/** Cost basis = total quote */
export function laborLineCostFromPricing(pricing: LinePricing) {
  return pricing.totalQuote;
}

/** Billable = total sale */
export function laborLineBillableFromPricing(pricing: LinePricing) {
  return pricing.totalSale;
}

/** @deprecated use laborLinePricing */
export function laborLineCost(
  est: number,
  act: number,
  rate: number,
  rateType: LaborRateType | null | undefined = "hourly",
) {
  if (normalizeLaborRateType(rateType) === "flat") return Number(rate || 0);
  const hours = act > 0 ? act : est;
  return hours * Number(rate || 0);
}

/** @deprecated use laborLinePricing */
export function laborLineBillable(
  act: number,
  billing: number,
  rateType: LaborRateType | null | undefined = "hourly",
) {
  if (normalizeLaborRateType(rateType) === "flat") return Number(billing || 0);
  return Number(act || 0) * Number(billing || 0);
}

export function sortLaborLines(entries: LaborEntry[]): LaborEntry[] {
  return [...entries]
    .filter((e): e is LaborEntry => e != null)
    .sort(
      (a, b) =>
        Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) ||
        String(a.work_date || "").localeCompare(String(b.work_date || "")),
    );
}

export function laborExportHeaders(includeRates: boolean): string[] {
  return [
    ...LABOR_EXPORT_BASE_HEADERS,
    ...(includeRates ? LABOR_EXPORT_RATE_HEADERS : []),
    ...LABOR_EXPORT_TAIL_HEADERS,
  ];
}

export function laborExportRow(
  e: LaborEntry,
  includeRates: boolean,
  index: number,
  projectDefaultOverridePct?: number | null,
): (string | number)[] {
  const pricing = laborLinePricing(e, projectDefaultOverridePct);
  const base: (string | number)[] = [
    e.task_description ?? "",
    e.notes ?? "",
    pricing.qty,
  ];
  const rates: (string | number)[] = includeRates
    ? [
        pricing.msrp,
        pricing.totalMsrp,
        pricing.unitQuote,
        pricing.totalQuote,
        pricing.overridePct * 100,
        pricing.unitSale,
        pricing.totalSale,
        pricing.outOfPocket,
      ]
    : [];
  const tail: (string | number)[] = [
    e.approval_status,
    e.sort_order ?? index,
  ];
  return [...base, ...rates, ...tail];
}

export function laborExportTotals(
  entries: LaborEntry[],
  projectDefaultOverridePct?: number | null,
) {
  let qty = 0;
  let totalMsrp = 0;
  let totalQuote = 0;
  let totalSale = 0;
  for (const e of entries) {
    const pricing = laborLinePricing(e, projectDefaultOverridePct);
    qty += pricing.qty;
    totalMsrp += pricing.totalMsrp;
    totalQuote += pricing.totalQuote;
    totalSale += pricing.totalSale;
  }
  return {
    qty,
    totalMsrp,
    totalQuote,
    totalSale,
    profit: totalSale - totalQuote,
    // legacy aliases used by Excel export
    estHours: qty,
    actHours: 0,
    cost: totalQuote,
    billable: totalSale,
  };
}
