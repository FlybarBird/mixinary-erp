import { newId } from "@/lib/local/db";
import { createClient } from "@/lib/supabase/server";
import { recalcPurchaseOrderEconomics } from "@/lib/projects/procurement";
import { rollupBomLineQuantities, writeAuditEvent } from "@/lib/projects/workspace";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Resolve how many units to move; omit/null qty means full move. */
export function resolveMoveQty(
  qtyOrdered: number,
  qty?: number | null,
): number {
  const ordered = Number(qtyOrdered || 0);
  if (!(ordered > 0)) throw new Error("Item has no quantity to move");
  if (qty == null) return ordered;
  const moveQty = Number(qty);
  if (!(moveQty > 0) || moveQty > ordered) {
    throw new Error("Invalid quantity to move/split");
  }
  return moveQty;
}

export async function ensurePoOwnerLink(
  supabase: Client,
  poId: string,
  projectId: string,
) {
  const { data: existing } = await supabase
    .from("purchase_order_project_links")
    .select("id, is_owner")
    .eq("po_id", poId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (existing) {
    if (!existing.is_owner) {
      await supabase
        .from("purchase_order_project_links")
        .update({ is_owner: true })
        .eq("id", existing.id);
    }
    return;
  }
  const { error } = await supabase.from("purchase_order_project_links").insert({
    id: newId(),
    po_id: poId,
    project_id: projectId,
    is_owner: true,
  });
  if (error) throw new Error(error.message);
}

export async function projectCanAccessPo(
  supabase: Client,
  projectId: string,
  poId: string,
) {
  const { data: owned } = await supabase
    .from("purchase_orders")
    .select("id")
    .eq("id", poId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (owned) return true;
  const { data: link } = await supabase
    .from("purchase_order_project_links")
    .select("id")
    .eq("po_id", poId)
    .eq("project_id", projectId)
    .maybeSingle();
  return Boolean(link);
}

/**
 * Move an entire PO item to another PO, or split `qty` onto the target PO.
 * Prevents moving more than qty_ordered. Recalculates economics and BOM rollups.
 */
export async function moveOrSplitPoItem(
  supabase: Client,
  params: {
    projectId: string;
    sourcePoId: string;
    targetPoId: string;
    itemId: string;
    qty?: number | null;
    actorId?: string | null;
  },
) {
  const { projectId, sourcePoId, targetPoId, itemId } = params;
  if (sourcePoId === targetPoId) {
    throw new Error("Source and target PO must differ");
  }

  const { data: sourcePo } = await supabase
    .from("purchase_orders")
    .select("id, project_id, vendor_id")
    .eq("id", sourcePoId)
    .maybeSingle();
  const { data: targetPo } = await supabase
    .from("purchase_orders")
    .select("id, project_id, vendor_id")
    .eq("id", targetPoId)
    .maybeSingle();

  if (!sourcePo || !targetPo) throw new Error("PO not found");
  if (
    sourcePo.project_id !== projectId &&
    !(await projectCanAccessPo(supabase, projectId, sourcePoId))
  ) {
    throw new Error("Source PO not accessible from this project");
  }
  if (
    targetPo.project_id !== projectId &&
    !(await projectCanAccessPo(supabase, projectId, targetPoId))
  ) {
    throw new Error("Target PO not accessible from this project");
  }

  const { data: item } = await supabase
    .from("purchase_order_items")
    .select("*")
    .eq("id", itemId)
    .eq("po_id", sourcePoId)
    .maybeSingle();
  if (!item) throw new Error("Item not found");

  const qtyOrdered = Number(item.qty_ordered || 0);
  const moveQty = resolveMoveQty(qtyOrdered, params.qty);

  const unitPrice = Number(item.unit_price || 0);
  const now = new Date().toISOString();
  const fullMove = moveQty >= qtyOrdered;

  if (fullMove) {
    const { error } = await supabase
      .from("purchase_order_items")
      .update({
        po_id: targetPoId,
        line_total: qtyOrdered * unitPrice,
        updated_at: now,
      })
      .eq("id", itemId);
    if (error) throw new Error(error.message);
  } else {
    const remainQty = qtyOrdered - moveQty;
    const { error: updErr } = await supabase
      .from("purchase_order_items")
      .update({
        qty_ordered: remainQty,
        line_total: remainQty * unitPrice,
        qty_received: Math.min(Number(item.qty_received || 0), remainQty),
        qty_shipped: Math.min(Number(item.qty_shipped || 0), remainQty),
        updated_at: now,
      })
      .eq("id", itemId);
    if (updErr) throw new Error(updErr.message);

    const { error: insErr } = await supabase.from("purchase_order_items").insert({
      id: newId(),
      po_id: targetPoId,
      line_item_id: item.line_item_id,
      sku: item.sku,
      vendor_sku: item.vendor_sku,
      description: item.description,
      qty_ordered: moveQty,
      unit_price: unitPrice,
      line_total: moveQty * unitPrice,
      shipping: 0,
      expected_ship_date: item.expected_ship_date,
      expected_delivery_date: item.expected_delivery_date,
      qty_shipped: 0,
      qty_received: 0,
      item_status: item.item_status,
      inherits_po_status: item.inherits_po_status ?? true,
      carrier_id: null,
      tracking_number: null,
      tracking_url: null,
      notes: item.notes,
    });
    if (insErr) throw new Error(insErr.message);
  }

  await recalcPurchaseOrderEconomics(supabase, sourcePoId);
  await recalcPurchaseOrderEconomics(supabase, targetPoId);

  if (item.line_item_id) {
    await rollupBomLineQuantities(supabase, item.line_item_id);
  }

  await writeAuditEvent(supabase, {
    projectId: sourcePo.project_id,
    entityType: "purchase_order_item",
    entityId: itemId,
    action: fullMove ? "move" : "split",
    before: {
      po_id: sourcePoId,
      qty_ordered: qtyOrdered,
    },
    after: {
      source_po_id: sourcePoId,
      target_po_id: targetPoId,
      moved_qty: moveQty,
      full_move: fullMove,
    },
    actorId: params.actorId ?? null,
  });

  return { ok: true as const, movedQty: moveQty, fullMove };
}

export async function renumberPurchaseOrder(
  supabase: Client,
  params: {
    projectId: string;
    poId: string;
    poNumber: string;
    actorId: string;
  },
) {
  const next = String(params.poNumber || "").trim();
  if (!next) throw new Error("po_number required");

  const { data: existing } = await supabase
    .from("purchase_orders")
    .select("id, project_id, po_number")
    .eq("id", params.poId)
    .maybeSingle();
  if (!existing) throw new Error("PO not found");
  if (
    existing.project_id !== params.projectId &&
    !(await projectCanAccessPo(supabase, params.projectId, params.poId))
  ) {
    throw new Error("PO not accessible");
  }

  const ownerProjectId = existing.project_id;
  const { data: clash } = await supabase
    .from("purchase_orders")
    .select("id")
    .eq("project_id", ownerProjectId)
    .eq("po_number", next)
    .neq("id", params.poId)
    .maybeSingle();
  if (clash) throw new Error(`PO number ${next} already in use`);

  const before = existing.po_number;
  if (before === next) return { ok: true as const, before, after: next };

  const { error } = await supabase
    .from("purchase_orders")
    .update({ po_number: next, updated_at: new Date().toISOString() })
    .eq("id", params.poId);
  if (error) throw new Error(error.message);

  await writeAuditEvent(supabase, {
    projectId: ownerProjectId,
    entityType: "purchase_order",
    entityId: params.poId,
    action: "renumber",
    before: { po_number: before },
    after: { po_number: next },
    actorId: params.actorId,
  });

  return { ok: true as const, before, after: next };
}

export async function listAccessiblePoIds(
  supabase: Client,
  projectId: string,
): Promise<string[]> {
  const [{ data: owned }, { data: links }] = await Promise.all([
    supabase.from("purchase_orders").select("id").eq("project_id", projectId),
    supabase
      .from("purchase_order_project_links")
      .select("po_id")
      .eq("project_id", projectId),
  ]);
  const ids = new Set<string>();
  for (const row of owned ?? []) ids.add(row.id);
  for (const row of links ?? []) ids.add(row.po_id);
  return [...ids];
}

export async function linkPoToProject(
  supabase: Client,
  params: {
    ownerProjectId: string;
    poId: string;
    targetProjectId: string;
    actorId: string;
  },
) {
  const { data: po } = await supabase
    .from("purchase_orders")
    .select("id, project_id, po_number")
    .eq("id", params.poId)
    .maybeSingle();
  if (!po) throw new Error("PO not found");
  if (po.project_id !== params.ownerProjectId) {
    throw new Error("Only the owning project can share this PO");
  }
  if (params.targetProjectId === po.project_id) {
    throw new Error("PO is already owned by that project");
  }

  const { data: target } = await supabase
    .from("projects")
    .select("id, project_number, name")
    .eq("id", params.targetProjectId)
    .maybeSingle();
  if (!target) throw new Error("Target project not found");

  await ensurePoOwnerLink(supabase, po.id, po.project_id);

  const { data: existingLink } = await supabase
    .from("purchase_order_project_links")
    .select("id")
    .eq("po_id", po.id)
    .eq("project_id", params.targetProjectId)
    .maybeSingle();
  if (!existingLink) {
    const { error } = await supabase.from("purchase_order_project_links").insert({
      id: newId(),
      po_id: po.id,
      project_id: params.targetProjectId,
      is_owner: false,
    });
    if (error) throw new Error(error.message);
  }

  await writeAuditEvent(supabase, {
    projectId: po.project_id,
    entityType: "purchase_order",
    entityId: po.id,
    action: "share",
    before: null,
    after: {
      linked_project_id: params.targetProjectId,
      linked_project_number: target.project_number,
    },
    actorId: params.actorId,
  });

  return { ok: true as const, project: target };
}

export async function unlinkPoFromProject(
  supabase: Client,
  params: {
    requestProjectId: string;
    poId: string;
    linkedProjectId: string;
    actorId: string;
  },
) {
  const { data: po } = await supabase
    .from("purchase_orders")
    .select("id, project_id")
    .eq("id", params.poId)
    .maybeSingle();
  if (!po) throw new Error("PO not found");

  const { data: link } = await supabase
    .from("purchase_order_project_links")
    .select("id, is_owner, project_id")
    .eq("po_id", params.poId)
    .eq("project_id", params.linkedProjectId)
    .maybeSingle();
  if (!link) throw new Error("Link not found");
  if (link.is_owner) throw new Error("Cannot remove the owning project link");

  // Owner project can unlink any share; linked project can unlink itself.
  const allowed =
    params.requestProjectId === po.project_id ||
    params.requestProjectId === params.linkedProjectId;
  if (!allowed) throw new Error("Not allowed to remove this share");

  const { error } = await supabase
    .from("purchase_order_project_links")
    .delete()
    .eq("id", link.id);
  if (error) throw new Error(error.message);

  await writeAuditEvent(supabase, {
    projectId: po.project_id,
    entityType: "purchase_order",
    entityId: po.id,
    action: "unshare",
    before: { linked_project_id: params.linkedProjectId },
    after: null,
    actorId: params.actorId,
  });

  return { ok: true as const };
}
