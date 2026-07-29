import { newId } from "@/lib/local/db";
import { rollupBomLineQuantities } from "@/lib/projects/workspace";
import {
  recalcPurchaseOrderEconomics,
  suggestPoStatus,
} from "@/lib/projects/procurement";
import { rebuildProjectCostLedger } from "@/lib/projects/cost-ledger";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type ReceiveItemSummary = {
  id: string;
  po_id: string;
  po_number: string;
  description: string;
  sku: string | null;
  qty_ordered: number;
  qty_received: number;
  item_status: string;
  remaining: number;
};

export function deriveReceiveStatus(
  qtyReceived: number,
  qtyOrdered: number,
): "received" | "partially_received" | null {
  if (qtyReceived >= qtyOrdered && qtyOrdered > 0) return "received";
  if (qtyReceived > 0) return "partially_received";
  return null;
}

export async function syncPoStatusFromItems(supabase: Supabase, poId: string) {
  const { data: items } = await supabase
    .from("purchase_order_items")
    .select("item_status, qty_ordered, qty_shipped, qty_received")
    .eq("po_id", poId);
  if (!items) return null;
  const { status } = suggestPoStatus(
    items as Array<{
      item_status: string;
      qty_ordered: number;
      qty_shipped: number;
      qty_received: number;
    }>,
  );
  await supabase
    .from("purchase_orders")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", poId);
  return status;
}

export async function loadReceiveItemSummary(
  supabase: Supabase,
  projectId: string,
  itemId: string,
): Promise<{ data?: ReceiveItemSummary; error?: string; status?: number }> {
  const { data: item } = await supabase
    .from("purchase_order_items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();

  if (!item) return { error: "Item not found", status: 404 };

  const { data: po } = await supabase
    .from("purchase_orders")
    .select("id, po_number, project_id")
    .eq("id", item.po_id)
    .maybeSingle();

  if (!po || po.project_id !== projectId) {
    return { error: "Item not found", status: 404 };
  }

  const qtyOrdered = Number(item.qty_ordered || 0);
  const qtyReceived = Number(item.qty_received || 0);

  return {
    data: {
      id: item.id,
      po_id: item.po_id,
      po_number: String(po.po_number || ""),
      description: String(item.description || ""),
      sku: item.sku ?? null,
      qty_ordered: qtyOrdered,
      qty_received: qtyReceived,
      item_status: String(item.item_status || "not_ordered"),
      remaining: Math.max(0, qtyOrdered - qtyReceived),
    },
  };
}

/**
 * Receive against a PO item. Default qty = remaining (full receive).
 */
export async function receivePoItem(
  supabase: Supabase,
  params: {
    projectId: string;
    itemId: string;
    qtyReceived?: number | null;
    actorId: string;
  },
) {
  const loaded = await loadReceiveItemSummary(
    supabase,
    params.projectId,
    params.itemId,
  );
  if (!loaded.data) {
    return { error: loaded.error ?? "Not found", status: loaded.status ?? 404 };
  }

  const summary = loaded.data;
  const qtyOrdered = summary.qty_ordered;
  const prevQty = summary.qty_received;

  let nextQty: number;
  if (params.qtyReceived == null || Number.isNaN(Number(params.qtyReceived))) {
    nextQty = qtyOrdered; // receive remaining = set to full ordered
  } else {
    nextQty = Number(params.qtyReceived);
  }
  if (nextQty < 0) nextQty = 0;

  if (nextQty === prevQty && summary.remaining === 0) {
    return {
      ok: true as const,
      alreadyComplete: true as const,
      data: summary,
    };
  }

  const derived = deriveReceiveStatus(nextQty, qtyOrdered);
  const itemStatus = derived ?? summary.item_status;

  const { data: updated, error } = await supabase
    .from("purchase_order_items")
    .update({
      qty_received: nextQty,
      item_status: itemStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.itemId)
    .select("*")
    .maybeSingle();

  if (error) return { error: error.message, status: 400 };

  await supabase.from("tracking_events").insert({
    id: newId(),
    po_item_id: params.itemId,
    event_at: new Date().toISOString(),
    status: itemStatus,
    message:
      itemStatus !== summary.item_status
        ? `Received via QR: status ${summary.item_status} → ${itemStatus} (qty ${nextQty})`
        : `Received via QR: qty ${nextQty}`,
    created_by: params.actorId,
  });

  const { data: lineRow } = await supabase
    .from("purchase_order_items")
    .select("line_item_id")
    .eq("id", params.itemId)
    .maybeSingle();

  if (lineRow?.line_item_id) {
    await rollupBomLineQuantities(supabase, lineRow.line_item_id);
  }

  const poTotals = await recalcPurchaseOrderEconomics(supabase, summary.po_id);
  const poStatus = await syncPoStatusFromItems(supabase, summary.po_id);

  try {
    await rebuildProjectCostLedger(supabase, params.projectId);
  } catch {
    // non-fatal
  }

  const refreshed = await loadReceiveItemSummary(
    supabase,
    params.projectId,
    params.itemId,
  );

  return {
    ok: true as const,
    alreadyComplete: false as const,
    data: refreshed.data ?? {
      ...summary,
      qty_received: nextQty,
      item_status: itemStatus,
      remaining: Math.max(0, qtyOrdered - nextQty),
    },
    item: updated,
    poTotals,
    poStatus,
  };
}
