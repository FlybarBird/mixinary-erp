import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canManageProcurement, canReceive } from "@/lib/auth";
import {
  redactPoItemMoney,
  redactPurchaseOrderMoney,
} from "@/lib/money-redaction";
import { requireProjectApiContext } from "@/lib/project-guard";
import { newId } from "@/lib/local/db";
import {
  createNotification,
  rollupBomLineQuantities,
  syncBomLinePricingFromPoItem,
} from "@/lib/projects/workspace";
import {
  recalcPurchaseOrderEconomics,
  suggestPoStatus,
} from "@/lib/projects/procurement";
import { rebuildProjectCostLedger } from "@/lib/projects/cost-ledger";

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

async function syncPoStatusFromItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  poId: string,
) {
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; poId: string; itemId: string }> },
) {
  const { id: projectId, poId, itemId } = await params;
  const ctx = await requireProjectApiContext(projectId);
  if (ctx instanceof NextResponse) return ctx;
  const profile = ctx.profile;

  const isManager = ctx.canEdit(canManageProcurement);
  const isReceiver = ctx.canEdit(canReceive);
  if (!isManager && !isReceiver) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as Record<string, unknown>;

  if (!ctx.canViewMoney) {
    // Money-denied editors cannot change item pricing.
    delete body.unit_price;
    delete body.line_total;
  }

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

  let safeUpdated = updated;
  let safePo = po ? { ...po, items: items ?? [] } : null;
  let safePoTotals = poTotals;
  if (!ctx.canViewMoney) {
    safeUpdated = updated
      ? redactPoItemMoney(updated as Record<string, unknown>)
      : updated;
    if (safePo) {
      const redacted = redactPurchaseOrderMoney(
        safePo as Record<string, unknown>,
      );
      redacted.items = (items ?? []).map((item) =>
        redactPoItemMoney(item as Record<string, unknown>),
      );
      safePo = redacted as typeof safePo;
    }
    safePoTotals = null;
  }

  return NextResponse.json({
    data: safeUpdated,
    poTotals: safePoTotals,
    poStatus,
    bomLine: ctx.canViewMoney ? bomLine : null,
    bomPricing: ctx.canViewMoney ? bomPricing : null,
    po: safePo,
  });
}
