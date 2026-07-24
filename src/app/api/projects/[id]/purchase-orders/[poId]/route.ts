import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canManageProcurement, getCurrentProfile } from "@/lib/auth";
import {
  rollupBomLineQuantities,
  rollupBomLinesForPo,
  writeAuditEvent,
} from "@/lib/projects/workspace";
import {
  recalcPurchaseOrderEconomics,
  suggestPoStatus,
} from "@/lib/projects/procurement";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; poId: string }> },
) {
  const { id: projectId, poId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageProcurement(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { cascadeItemStatus, item_status, ...fields } = body as {
    cascadeItemStatus?: boolean;
    item_status?: string;
    status?: string;
    [key: string]: unknown;
  };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("purchase_orders")
    .select("*, items:purchase_order_items(*)")
    .eq("id", poId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const prevStatus = existing.status;

  // Cascade item status if requested
  if (cascadeItemStatus && item_status) {
    await supabase
      .from("purchase_order_items")
      .update({ item_status })
      .eq("po_id", poId);
  }

  // Recompute status from items if no explicit status provided
  let newStatus = fields.status as string | undefined;
  if (!newStatus) {
    const { data: items } = await supabase
      .from("purchase_order_items")
      .select("item_status, qty_ordered, qty_shipped, qty_received")
      .eq("po_id", poId);
    if (items && items.length > 0) {
      const { status } = suggestPoStatus(
        items as Array<{ item_status: string; qty_ordered: number; qty_shipped: number; qty_received: number }>,
      );
      newStatus = status;
    }
  }

  const updatePayload: Record<string, unknown> = { ...fields };
  if (newStatus) updatePayload.status = newStatus;
  delete updatePayload.id;
  delete updatePayload.project_id;
  delete updatePayload.items;
  delete updatePayload.vendors;

  if (fields.shipping != null) {
    updatePayload.shipping = Number(fields.shipping) || 0;
  }
  if (fields.tax != null) {
    updatePayload.tax = Number(fields.tax) || 0;
  }

  // Keep merchandise subtotal; recompute total when money fields change
  const moneyTouched =
    fields.shipping != null || fields.tax != null || fields.subtotal != null;
  if (moneyTouched) {
    const { data: items } = await supabase
      .from("purchase_order_items")
      .select("line_total")
      .eq("po_id", poId);
    const subtotal = (items ?? []).reduce(
      (s, i) => s + Number(i.line_total || 0),
      0,
    );
    const tax =
      fields.tax != null ? Number(fields.tax) || 0 : Number(existing.tax || 0);
    const shipping =
      fields.shipping != null
        ? Number(fields.shipping) || 0
        : Number(existing.shipping || 0);
    updatePayload.subtotal = subtotal;
    updatePayload.total = subtotal + tax + shipping;
  }

  updatePayload.updated_at = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from("purchase_orders")
    .update(updatePayload)
    .eq("id", poId)
    .eq("project_id", projectId)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (
    fields.shipping != null ||
    fields.tax != null ||
    fields.subtotal != null
  ) {
    await recalcPurchaseOrderEconomics(supabase, poId);
  }

  if (newStatus && newStatus !== prevStatus) {
    await writeAuditEvent(supabase, {
      projectId,
      entityType: "purchase_order",
      entityId: poId,
      action: "status_change",
      before: { status: prevStatus },
      after: { status: newStatus },
      actorId: profile.id,
    });
  }

  // If cascade changed item statuses, roll up BOM qty/status fields only.
  let bomLines = null;
  if (cascadeItemStatus && item_status) {
    bomLines = await rollupBomLinesForPo(supabase, poId);
  }

  const [{ data: po }, { data: items }] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("*, vendors(id, code, name)")
      .eq("id", poId)
      .maybeSingle(),
    supabase.from("purchase_order_items").select("*").eq("po_id", poId),
  ]);

  return NextResponse.json({
    data: po ? { ...po, items: items ?? [] } : updated,
    bomLines,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; poId: string }> },
) {
  const { id: projectId, poId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageProcurement(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();

  // Collect linked BOM lines before delete, then roll up after items are gone.
  const { data: items } = await supabase
    .from("purchase_order_items")
    .select("line_item_id")
    .eq("po_id", poId);

  const lineItemIds = [
    ...new Set(
      (items ?? [])
        .map((i) => i.line_item_id)
        .filter(Boolean) as string[],
    ),
  ];

  const { error } = await supabase
    .from("purchase_orders")
    .delete()
    .eq("id", poId)
    .eq("project_id", projectId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  for (const lineItemId of lineItemIds) {
    await rollupBomLineQuantities(supabase, lineItemId);
  }

  return NextResponse.json({ ok: true });
}
