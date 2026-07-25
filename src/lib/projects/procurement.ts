import { calculateLinePricing } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";
import type { PoItemStatus, PoStatus, ProcurementStatus } from "@/lib/types";

export type LineEconomics = {
  sale_total: number;
  allocated_shipping: number;
  allocated_tax: number;
  cost_total: number;
  profit: number;
  margin_pct: number | null;
};

export type BomPricingFields = {
  msrp: number | null;
  quote: number | null;
  override_pct: number | null;
};

/** Allocate PO shipping/tax across lines by line_total weight (even split if sum is 0). */
export function allocatePoOverhead(
  lineTotals: number[],
  shipping: number,
  tax: number,
): Array<{ allocated_shipping: number; allocated_tax: number }> {
  const n = lineTotals.length;
  const sum = lineTotals.reduce((a, b) => a + b, 0);
  return lineTotals.map((lt) => {
    const share = sum > 0 ? lt / sum : n > 0 ? 1 / n : 0;
    return {
      allocated_shipping: shipping * share,
      allocated_tax: tax * share,
    };
  });
}

export function procurementLineEconomics(params: {
  qtyOrdered: number;
  lineTotal: number;
  allocatedShipping: number;
  allocatedTax: number;
  bom?: BomPricingFields | null;
  projectDefaultOverridePct?: number | null;
}): LineEconomics {
  let sale_total = 0;
  if (params.bom) {
    const pricing = calculateLinePricing({
      qty: params.qtyOrdered,
      msrp: params.bom.msrp,
      quote: params.bom.quote,
      overridePct: params.bom.override_pct,
      projectDefaultOverridePct: params.projectDefaultOverridePct,
    });
    sale_total = pricing.totalSale;
  }
  const cost_total =
    params.lineTotal + params.allocatedShipping + params.allocatedTax;
  const profit = sale_total - cost_total;
  const margin_pct = sale_total > 0 ? profit / sale_total : null;
  return {
    sale_total,
    allocated_shipping: params.allocatedShipping,
    allocated_tax: params.allocatedTax,
    cost_total,
    profit,
    margin_pct,
  };
}

export function rollupPoEconomics(lines: LineEconomics[]) {
  const sale_total = lines.reduce((s, l) => s + l.sale_total, 0);
  const profit = lines.reduce((s, l) => s + l.profit, 0);
  const margin_pct = sale_total > 0 ? profit / sale_total : null;
  return { sale_total, profit, margin_pct };
}

export function computePoEconomics(params: {
  shipping: number;
  tax: number;
  items: Array<{
    qty_ordered: number;
    line_total: number;
    bom?: BomPricingFields | null;
  }>;
  projectDefaultOverridePct?: number | null;
}) {
  const lineTotals = params.items.map((i) => Number(i.line_total || 0));
  const allocations = allocatePoOverhead(
    lineTotals,
    Number(params.shipping || 0),
    Number(params.tax || 0),
  );
  const lines = params.items.map((item, i) =>
    procurementLineEconomics({
      qtyOrdered: Number(item.qty_ordered || 0),
      lineTotal: lineTotals[i] ?? 0,
      allocatedShipping: allocations[i]?.allocated_shipping ?? 0,
      allocatedTax: allocations[i]?.allocated_tax ?? 0,
      bom: item.bom,
      projectDefaultOverridePct: params.projectDefaultOverridePct,
    }),
  );
  return { lines, po: rollupPoEconomics(lines) };
}

type Client = Awaited<ReturnType<typeof createClient>>;

/** Persist line + PO sale/cost/profit/margin and refresh subtotal/total. */
export async function recalcPurchaseOrderEconomics(
  supabase: Client,
  poId: string,
) {
  const { data: po } = await supabase
    .from("purchase_orders")
    .select("id, project_id, shipping, tax")
    .eq("id", poId)
    .maybeSingle();

  if (!po) return null;

  const { data: items } = await supabase
    .from("purchase_order_items")
    .select("*")
    .eq("po_id", poId);

  const projectId = String(po.project_id);
  const { data: project } = await supabase
    .from("projects")
    .select("default_override_pct")
    .eq("id", projectId)
    .maybeSingle();

  const lineIds = [
    ...new Set(
      (items ?? [])
        .map((i) => (i as { line_item_id?: string | null }).line_item_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const bomMap = new Map<string, BomPricingFields>();
  if (lineIds.length) {
    const { data: lines } = await supabase
      .from("line_items")
      .select("id, msrp, quote, override_pct")
      .in("id", lineIds);
    for (const line of lines ?? []) {
      bomMap.set(String(line.id), {
        msrp: (line.msrp as number | null) ?? null,
        quote: (line.quote as number | null) ?? null,
        override_pct: (line.override_pct as number | null) ?? null,
      });
    }
  }

  const shipping = Number(po.shipping || 0);
  const tax = Number(po.tax || 0);
  const itemRows = items ?? [];
  const computed = computePoEconomics({
    shipping,
    tax,
    items: itemRows.map((item) => {
      const row = item as {
        qty_ordered?: number;
        line_total?: number;
        line_item_id?: string | null;
      };
      return {
        qty_ordered: Number(row.qty_ordered || 0),
        line_total: Number(row.line_total || 0),
        bom: row.line_item_id
          ? bomMap.get(String(row.line_item_id)) ?? null
          : null,
      };
    }),
    projectDefaultOverridePct:
      (project?.default_override_pct as number | null | undefined) ?? null,
  });

  const subtotal = itemRows.reduce(
    (s, i) => s + Number((i as { line_total?: number }).line_total || 0),
    0,
  );
  const total = subtotal + tax + shipping;
  const now = new Date().toISOString();

  for (let i = 0; i < itemRows.length; i++) {
    const item = itemRows[i] as { id: string };
    const econ = computed.lines[i]!;
    await supabase
      .from("purchase_order_items")
      .update({
        sale_total: econ.sale_total,
        allocated_shipping: econ.allocated_shipping,
        allocated_tax: econ.allocated_tax,
        cost_total: econ.cost_total,
        profit: econ.profit,
        margin_pct: econ.margin_pct,
        updated_at: now,
      })
      .eq("id", item.id);
  }

  await supabase
    .from("purchase_orders")
    .update({
      subtotal,
      total,
      sale_total: computed.po.sale_total,
      profit: computed.po.profit,
      margin_pct: computed.po.margin_pct,
      updated_at: now,
    })
    .eq("id", poId);

  return {
    subtotal,
    total,
    tax,
    shipping,
    sale_total: computed.po.sale_total,
    profit: computed.po.profit,
    margin_pct: computed.po.margin_pct,
  };
}

export function suggestPoStatus(
  items: Array<{ item_status: string; qty_ordered: number; qty_shipped: number; qty_received: number }>,
): { status: PoStatus; warning?: string } {
  const active = items.filter((i) => i.item_status !== "cancelled");
  if (!items.length) return { status: "draft" };
  if (!active.length) return { status: "cancelled" };

  const allReceived = active.every(
    (i) =>
      i.item_status === "received" ||
      (i.qty_ordered > 0 && i.qty_received >= i.qty_ordered),
  );
  if (allReceived) return { status: "received" };

  const anyReceived = active.some(
    (i) => i.qty_received > 0 || i.item_status === "partially_received" || i.item_status === "received",
  );
  const allShipped = active.every(
    (i) =>
      i.item_status === "shipped" ||
      i.item_status === "in_transit" ||
      i.item_status === "out_for_delivery" ||
      i.item_status === "received" ||
      i.item_status === "partially_received" ||
      (i.qty_shipped >= i.qty_ordered && i.qty_ordered > 0),
  );
  const anyShipped = active.some(
    (i) =>
      i.qty_shipped > 0 ||
      ["shipped", "in_transit", "out_for_delivery", "partially_received", "received"].includes(
        i.item_status,
      ),
  );

  if (anyReceived && !allReceived) return { status: "partially_received" };
  if (allShipped && !anyReceived) return { status: "shipped" };
  if (anyShipped && !anyReceived) return { status: "partially_shipped" };

  const delayed = active.some(
    (i) => i.item_status === "delayed" || i.item_status === "backordered",
  );
  if (delayed) {
    return {
      status: "ordered",
      warning: "Mixed delayed or backordered items",
    };
  }

  const allOrdered = active.every((i) => i.item_status !== "not_ordered");
  if (allOrdered) return { status: "ordered" };
  return { status: "draft" };
}

export function deriveBomProcurementStatus(params: {
  qty: number;
  qtyOrdered: number;
  qtyReceived: number;
}): ProcurementStatus {
  const { qty, qtyOrdered, qtyReceived } = params;
  if (qtyReceived >= qty && qty > 0) return "received";
  if (qtyReceived > 0) return "partially_received";
  if (qtyOrdered >= qty && qty > 0) return "ordered";
  if (qtyOrdered > 0) return "partially_ordered";
  return "not_ordered";
}

export const PO_STATUSES: PoStatus[] = [
  "draft",
  "ready_to_order",
  "ordered",
  "confirmed",
  "partially_shipped",
  "shipped",
  "partially_received",
  "received",
  "on_hold",
  "closed",
  "cancelled",
];

export const PO_ITEM_STATUSES: PoItemStatus[] = [
  "not_ordered",
  "ordered",
  "confirmed",
  "preparing",
  "backordered",
  "shipped",
  "in_transit",
  "out_for_delivery",
  "partially_received",
  "received",
  "delayed",
  "cancelled",
];

export function formatStatusLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
