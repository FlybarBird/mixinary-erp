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

/** Recompute BOM qty_ordered / qty_received / procurement_status from PO items. */
export async function rollupBomLineQuantities(
  supabase: Client,
  lineItemId: string,
) {
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

  const qty = Number(line?.qty || 0);
  let procurement_status = "not_ordered";
  if (qtyReceived >= qty && qty > 0) procurement_status = "received";
  else if (qtyReceived > 0) procurement_status = "partially_received";
  else if (qtyOrdered >= qty && qty > 0) procurement_status = "ordered";
  else if (qtyOrdered > 0) procurement_status = "partially_ordered";

  await supabase
    .from("line_items")
    .update({
      qty_ordered: qtyOrdered,
      qty_received: qtyReceived,
      procurement_status,
      order_status:
        qtyReceived >= qty && qty > 0
          ? "shipped"
          : qtyOrdered > 0
            ? "ordered"
            : "none",
      updated_at: new Date().toISOString(),
    })
    .eq("id", lineItemId);
}
