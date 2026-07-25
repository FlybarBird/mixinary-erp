import { newId } from "@/lib/local/db";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export async function writeAuditEvent(
  supabase: Client,
  params: {
    projectId: string;
    entityType: string;
    entityId: string;
    action: string;
    before?: unknown;
    after?: unknown;
    actorId?: string | null;
    reason?: string | null;
  },
) {
  await supabase.from("audit_events").insert({
    id: newId(),
    project_id: params.projectId,
    entity_type: params.entityType,
    entity_id: params.entityId,
    action: params.action,
    before_json: params.before ?? null,
    after_json: params.after ?? null,
    actor_id: params.actorId ?? null,
    reason: params.reason?.trim() || null,
  });
}

export async function createNotification(
  supabase: Client,
  params: {
    userId: string;
    projectId?: string | null;
    title: string;
    body?: string | null;
    href?: string | null;
  },
) {
  await supabase.from("app_notifications").insert({
    id: newId(),
    user_id: params.userId,
    project_id: params.projectId ?? null,
    title: params.title,
    body: params.body ?? null,
    href: params.href ?? null,
  });
}

export type BomRollupResult = {
  id: string;
  qty: number;
  qty_ordered: number;
  qty_received: number;
  procurement_status: string;
  order_status: string;
};

/** Recompute BOM qty_ordered / qty_received / procurement_status from PO items. */
export async function rollupBomLineQuantities(
  supabase: Client,
  lineItemId: string,
): Promise<BomRollupResult | null> {
  const { data: items } = await supabase
    .from("purchase_order_items")
    .select("qty_ordered, qty_received, item_status")
    .eq("line_item_id", lineItemId);

  const active = (items ?? []).filter((i) => i.item_status !== "cancelled");
  const qtyOrdered = active.reduce((s, i) => s + Number(i.qty_ordered || 0), 0);
  const qtyReceived = active.reduce(
    (s, i) => s + Number(i.qty_received || 0),
    0,
  );

  const { data: line } = await supabase
    .from("line_items")
    .select("qty")
    .eq("id", lineItemId)
    .maybeSingle();

  if (!line) return null;

  const qty = Number(line.qty || 0);
  let procurement_status = "not_ordered";
  if (qtyReceived >= qty && qty > 0) procurement_status = "received";
  else if (qtyReceived > 0) procurement_status = "partially_received";
  else if (qtyOrdered >= qty && qty > 0) procurement_status = "ordered";
  else if (qtyOrdered > 0) procurement_status = "partially_ordered";

  const order_status =
    qtyReceived >= qty && qty > 0
      ? "shipped"
      : qtyOrdered > 0
        ? "ordered"
        : "none";

  await supabase
    .from("line_items")
    .update({
      qty_ordered: qtyOrdered,
      qty_received: qtyReceived,
      procurement_status,
      order_status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lineItemId);

  return {
    id: lineItemId,
    qty,
    qty_ordered: qtyOrdered,
    qty_received: qtyReceived,
    procurement_status,
    order_status,
  };
}

/** Roll up every BOM line linked to items on a PO. */
export async function rollupBomLinesForPo(
  supabase: Client,
  poId: string,
): Promise<BomRollupResult[]> {
  const { data: items } = await supabase
    .from("purchase_order_items")
    .select("line_item_id")
    .eq("po_id", poId);

  const lineIds = [
    ...new Set(
      (items ?? [])
        .map((i) => i.line_item_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const results: BomRollupResult[] = [];
  for (const lineItemId of lineIds) {
    const rolled = await rollupBomLineQuantities(supabase, lineItemId);
    if (rolled) results.push(rolled);
  }
  return results;
}

export type BomPricingSyncResult = {
  id: string;
  quote: number;
  estimated_unit_cost: number;
};

/**
 * Push actual PO unit price onto the linked BOM line as quote + estimated cost
 * so project Sale / OOP / margin reflect what was purchased.
 */
export async function syncBomLinePricingFromPoItem(
  supabase: Client,
  lineItemId: string,
  unitPrice: number,
): Promise<BomPricingSyncResult | null> {
  const price = Number(unitPrice);
  if (!Number.isFinite(price)) return null;

  const { data: line } = await supabase
    .from("line_items")
    .select("id")
    .eq("id", lineItemId)
    .maybeSingle();
  if (!line) return null;

  await supabase
    .from("line_items")
    .update({
      quote: price,
      estimated_unit_cost: price,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lineItemId);

  return {
    id: lineItemId,
    quote: price,
    estimated_unit_cost: price,
  };
}
