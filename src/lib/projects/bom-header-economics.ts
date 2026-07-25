import { calculateLinePricing, sumPricing } from "@/lib/pricing";

const INACTIVE_PO = new Set(["draft", "cancelled"]);

export type BomHeaderLine = {
  id: string;
  qty: number | null | undefined;
  msrp: number | null | undefined;
  quote?: number | null;
  override_pct?: number | null;
};

export type BomHeaderPo = {
  id: string;
  status: string;
  shipping?: number | null;
};

export type BomHeaderPoItem = {
  po_id: string;
  line_item_id?: string | null;
  qty_ordered?: number | null;
  unit_price?: number | null;
  line_total?: number | null;
  item_status?: string | null;
};

export type BomHeaderEconomics = {
  totalMsrp: number;
  totalQuote: number;
  totalSale: number;
  clientSavings: number;
  /** Quote-based OOP (Sale − Quote); kept for reference / line consistency checks */
  quoteOutOfPocket: number;
  /** Active PO item costs + shipping + unordered BOM at quote */
  materialCost: number;
  poItemCost: number;
  poShipping: number;
  unorderedQuoteCost: number;
  /** Sale − materialCost */
  outOfPocket: number;
  /** OOP ÷ Sale, or null when no sale */
  margin: number | null;
};

function money(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * BOM header economics: Sale/MSRP/Quote from BOM pricing;
 * Out of Pocket / Margin use live procurement costs + shipping
 * without mutating per-line quote/OOP display.
 */
export function computeBomHeaderEconomics(input: {
  lines: BomHeaderLine[];
  purchaseOrders: BomHeaderPo[];
  poItems: BomHeaderPoItem[];
  projectDefaultOverridePct?: number | null;
}): BomHeaderEconomics {
  const priced = input.lines.map((line) =>
    calculateLinePricing({
      qty: line.qty,
      msrp: line.msrp,
      quote: line.quote,
      overridePct: line.override_pct,
      projectDefaultOverridePct: input.projectDefaultOverridePct,
    }),
  );
  const totals = sumPricing(priced);

  const activePoIds = new Set(
    input.purchaseOrders
      .filter((po) => !INACTIVE_PO.has(String(po.status || "")))
      .map((po) => po.id),
  );

  let poItemCost = 0;
  const orderedQtyByLine = new Map<string, number>();

  for (const item of input.poItems) {
    if (!activePoIds.has(item.po_id)) continue;
    if (String(item.item_status || "") === "cancelled") continue;

    const qtyOrdered = Number(item.qty_ordered || 0);
    const lineTotal =
      item.line_total != null && item.line_total !== undefined
        ? Number(item.line_total)
        : qtyOrdered * Number(item.unit_price || 0);
    poItemCost += lineTotal;

    if (item.line_item_id) {
      orderedQtyByLine.set(
        item.line_item_id,
        (orderedQtyByLine.get(item.line_item_id) || 0) + qtyOrdered,
      );
    }
  }

  let poShipping = 0;
  for (const po of input.purchaseOrders) {
    if (!activePoIds.has(po.id)) continue;
    poShipping += Number(po.shipping || 0);
  }

  let unorderedQuoteCost = 0;
  for (let i = 0; i < input.lines.length; i++) {
    const line = input.lines[i];
    const pricing = priced[i];
    const qty = Number(line.qty || 0);
    const ordered = orderedQtyByLine.get(line.id) || 0;
    const remaining = Math.max(0, qty - ordered);
    if (remaining <= 0) continue;
    unorderedQuoteCost += remaining * pricing.unitQuote;
  }

  const materialCost = money(poItemCost + poShipping + unorderedQuoteCost);
  const outOfPocket = money(totals.totalSale - materialCost);
  const margin =
    totals.totalSale > 0 ? outOfPocket / totals.totalSale : null;

  return {
    totalMsrp: money(totals.totalMsrp),
    totalQuote: money(totals.totalQuote),
    totalSale: money(totals.totalSale),
    clientSavings: money(totals.clientSavings),
    quoteOutOfPocket: money(totals.outOfPocket),
    materialCost,
    poItemCost: money(poItemCost),
    poShipping: money(poShipping),
    unorderedQuoteCost: money(unorderedQuoteCost),
    outOfPocket,
    margin,
  };
}
