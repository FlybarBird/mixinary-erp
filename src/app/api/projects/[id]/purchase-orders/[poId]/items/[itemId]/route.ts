import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canManageProcurement, canReceive, getCurrentProfile } from "@/lib/auth";
import { newId } from "@/lib/local/db";
import {
  createNotification,
  rollupBomLineQuantities,
  syncBomLinePricingFromPoItem,
} from "@/lib/projects/workspace";
import {
  mapPoStatusToItemStatus,
  recalcPurchaseOrderEconomics,
} from "@/lib/projects/procurement";
import { rebuildProjectCostLedger } from "@/lib/projects/cost-ledger";
import {
  deriveReceiveStatus,
  syncPoStatusFromItems,
} from "@/lib/projects/receive";

const ALERT_STATUSES = new Set(["delayed", "backordered"]);

const RECEIVE_FIELDS = new Set([
  "qty_received",
  "qty_shipped",
  "carrier_id",
  "tracking_number",
  "tracking_url",
  "latest_tracking_update",
  "expected_delivery_date",
  "expected_ship_date",
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; poId: string; itemId: string }> },
) {
  const { id: projectId, poId, itemId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isManager = canManageProcurement(profile.role);
  const isReceiver = canReceive(profile.role);
  if (!isManager && !isReceiver) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as Record<string, unknown>;

  if (!isManager) {
    const attemptedKeys = Object.keys(body);
    const disallowed = attemptedKeys.filter(
      (k) => !RECEIVE_FIELDS.has(k) && k !== "item_status",
    );
    if (disallowed.length > 0) {
      return NextResponse.json(
        { error: `Forbidden fields: ${disallowed.join(", ")}` },
        { status: 403 },
      );
    }
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("purchase_order_items")
    .select("*")
    .eq("id", itemId)
    .eq("po_id", poId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: parentPo } = await supabase
    .from("purchase_orders")
    .select("project_id")
    .eq("id", poId)
    .maybeSingle();

  if (!parentPo || parentPo.project_id !== projectId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const prevStatus = existing.item_status;
  const prevQtyReceived = Number(existing.qty_received ?? 0);

  const updatePayload: Record<string, unknown> = { ...body };
  delete updatePayload.id;
  delete updatePayload.po_id;

  const newQty =
    body.qty_ordered != null
      ? Number(body.qty_ordered)
      : Number(existing.qty_ordered ?? 0);

  if (body.line_total != null) {
    const lineTotal = Number(body.line_total);
    updatePayload.line_total = lineTotal;
    if (newQty > 0) {
      updatePayload.unit_price = lineTotal / newQty;
    }
    if (body.qty_ordered != null) updatePayload.qty_ordered = newQty;
  } else if (body.qty_ordered != null || body.unit_price != null) {
    const newPrice =
      body.unit_price != null
        ? Number(body.unit_price)
        : Number(existing.unit_price ?? 0);
    updatePayload.line_total = newQty * newPrice;
    updatePayload.unit_price = newPrice;
    if (body.qty_ordered != null) updatePayload.qty_ordered = newQty;
  }

  // Ignore per-item shipping — freight lives on the PO.

  // Strip item shipping if clients still send it
  delete updatePayload.shipping;

  // Auto-derive item status from qty_received when status not explicitly sent
  if (body.qty_received != null && body.item_status == null) {
    const qtyReceived = Number(body.qty_received);
    const derived = deriveReceiveStatus(qtyReceived, newQty);
    if (derived) {
      updatePayload.item_status = derived;
      // Receive-driven status is an item-specific override.
      if (body.inherits_po_status === undefined) {
        updatePayload.inherits_po_status = false;
      }
    }
  }

  // Manual status change breaks inheritance unless client re-enables it.
  if (
    body.item_status != null &&
    body.inherits_po_status === undefined &&
    String(body.item_status) !== String(prevStatus)
  ) {
    updatePayload.inherits_po_status = false;
  }

  // Re-enabling inheritance: sync item status from parent PO.
  if (body.inherits_po_status === true || body.inherits_po_status === 1) {
    const { data: parent } = await supabase
      .from("purchase_orders")
      .select("status")
      .eq("id", poId)
      .maybeSingle();
    const mapped = parent?.status
      ? mapPoStatusToItemStatus(String(parent.status))
      : null;
    if (mapped && body.item_status == null) {
      updatePayload.item_status = mapped;
    }
    updatePayload.inherits_po_status = true;
  } else if (body.inherits_po_status === false || body.inherits_po_status === 0) {
    updatePayload.inherits_po_status = false;
  }

  updatePayload.updated_at = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from("purchase_order_items")
    .update(updatePayload)
    .eq("id", itemId)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const poTotals = await recalcPurchaseOrderEconomics(supabase, poId);

  const newStatus = (updated as { item_status?: string } | null)?.item_status;
  const newQtyReceived = Number(
    (updated as { qty_received?: number } | null)?.qty_received ?? 0,
  );
  const lineItemId = (existing as { line_item_id?: string | null }).line_item_id;

  const statusChanged = Boolean(newStatus && newStatus !== prevStatus);
  const qtyChanged = newQtyReceived !== prevQtyReceived;
  const qtyOrderedChanged =
    body.qty_ordered != null &&
    Number(body.qty_ordered) !== Number(existing.qty_ordered ?? 0);
  const priceChanged =
    body.unit_price != null ||
    body.line_total != null ||
    qtyOrderedChanged;

  if (statusChanged || qtyChanged) {
    await supabase.from("tracking_events").insert({
      id: newId(),
      po_item_id: itemId,
      event_at: new Date().toISOString(),
      status: newStatus ?? prevStatus,
      message: statusChanged
        ? `Status changed from ${prevStatus} to ${newStatus}`
        : `Received qty updated to ${newQtyReceived}`,
      created_by: profile.id,
    });
  }

  // Qty/status → BOM procurement fields; price → BOM quote / estimated cost (project OOP/margin).
  let bomLine = null;
  let bomPricing = null;
  if (lineItemId && (statusChanged || qtyChanged || qtyOrderedChanged)) {
    bomLine = await rollupBomLineQuantities(supabase, lineItemId);
  }
  if (lineItemId && priceChanged) {
    const unitPrice = Number(
      (updated as { unit_price?: number } | null)?.unit_price ??
        existing.unit_price ??
        0,
    );
    bomPricing = await syncBomLinePricingFromPoItem(
      supabase,
      lineItemId,
      unitPrice,
    );
  }

  if (statusChanged && newStatus && ALERT_STATUSES.has(newStatus)) {
      const { data: project } = await supabase
        .from("projects")
        .select("id, created_by, project_manager_id")
        .eq("id", projectId)
        .maybeSingle();

      const notifyIds = new Set<string>();
      const proj = project as {
        created_by?: string | null;
        project_manager_id?: string | null;
      } | null;
      if (proj?.project_manager_id) notifyIds.add(proj.project_manager_id);
      if (proj?.created_by) notifyIds.add(proj.created_by);

      const { data: purchasers } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("role", "purchasing");
      for (const u of purchasers ?? []) notifyIds.add(u.id);

      const itemDesc = (existing as { description?: string }).description ?? "item";
      const statusLabel = newStatus === "delayed" ? "Delayed" : "Backordered";
      const href = `/projects/${projectId}/procurement`;

      await Promise.all(
        [...notifyIds].map((userId) =>
          createNotification(supabase, {
            userId,
            projectId,
            title: `${statusLabel}: ${itemDesc.slice(0, 80)}`,
            body: `PO item status changed to ${newStatus}.`,
            href,
          }),
        ),
      );
  }

  const poStatus = await syncPoStatusFromItems(supabase, poId);

  try {
    await rebuildProjectCostLedger(supabase, projectId);
  } catch {
    // Don't fail the item save if ledger rebuild errors
  }

  const [{ data: po }, { data: items }] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("*, vendors(id, code, name, contact_name, contact_email)")
      .eq("id", poId)
      .maybeSingle(),
    supabase.from("purchase_order_items").select("*").eq("po_id", poId),
  ]);

  return NextResponse.json({
    data: updated,
    poTotals,
    poStatus,
    bomLine,
    bomPricing,
    po: po ? { ...po, items: items ?? [] } : null,
  });
}
