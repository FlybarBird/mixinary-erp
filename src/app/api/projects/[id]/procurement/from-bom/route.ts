import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canManageProcurement, getCurrentProfile } from "@/lib/auth";
import { newId } from "@/lib/local/db";
import { rollupBomLineQuantities } from "@/lib/projects/workspace";
import { recalcPurchaseOrderEconomics } from "@/lib/projects/procurement";
import { allocateNextPoNumbers } from "@/lib/projects/numbering";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageProcurement(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { lineItemIds } = body as { lineItemIds: string[] };

  if (!lineItemIds?.length) {
    return NextResponse.json({ error: "lineItemIds required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: lines } = await supabase
    .from("line_items")
    .select("id, description, sku, qty, qty_ordered, vendor_id, estimated_unit_cost, quote, msrp")
    .in("id", lineItemIds)
    .eq("project_id", projectId);

  if (!lines?.length) {
    return NextResponse.json({ error: "No matching line items found" }, { status: 400 });
  }

  const warnings: string[] = [];
  const byVendor = new Map<
    string,
    Array<{
      id: string;
      description: string;
      sku: string | null;
      qty_remaining: number;
      unit_price: number;
    }>
  >();

  for (const line of lines) {
    if (!line.vendor_id) {
      warnings.push(`Line "${line.description}" skipped — no vendor assigned`);
      continue;
    }
    const qtyRemaining = Math.max(0, Number(line.qty || 0) - Number(line.qty_ordered || 0));
    if (qtyRemaining <= 0) {
      warnings.push(`Line "${line.description}" skipped — already fully ordered`);
      continue;
    }
    const unitPrice =
      Number(line.estimated_unit_cost || 0) ||
      Number(line.quote || 0) ||
      Number(line.msrp || 0) ||
      0;

    if (!byVendor.has(line.vendor_id)) byVendor.set(line.vendor_id, []);
    byVendor.get(line.vendor_id)!.push({
      id: line.id,
      description: line.description ?? "",
      sku: line.sku ?? null,
      qty_remaining: qtyRemaining,
      unit_price: unitPrice,
    });
  }

  if (byVendor.size === 0) {
    return NextResponse.json({ ok: true, created: [], warnings });
  }

  // Get sequential PO numbers from project #: PO-26070101, …
  const vendorIds = [...byVendor.keys()];
  const poNumbers = await allocateNextPoNumbers(
    supabase,
    projectId,
    vendorIds.length,
  );

  const created: string[] = [];
  const allLineItemIds = new Set<string>();

  let vendorIndex = 0;
  for (const [vendorId, vendorLines] of byVendor.entries()) {
    const poNumber = poNumbers[vendorIndex] ?? `PO-${vendorIndex + 1}`;
    vendorIndex++;

    const subtotal = vendorLines.reduce(
      (s, l) => s + l.qty_remaining * l.unit_price,
      0,
    );

    const poId = newId();
    const { error: poError } = await supabase.from("purchase_orders").insert({
      id: poId,
      project_id: projectId,
      vendor_id: vendorId,
      po_number: poNumber,
      ordered_by: profile.id,
      status: "draft",
      subtotal,
      total: subtotal,
    });

    if (poError) {
      warnings.push(`Failed to create PO for vendor ${vendorId}: ${poError.message}`);
      continue;
    }

    for (const line of vendorLines) {
      await supabase.from("purchase_order_items").insert({
        id: newId(),
        po_id: poId,
        line_item_id: line.id,
        description: line.description,
        sku: line.sku,
        qty_ordered: line.qty_remaining,
        unit_price: line.unit_price,
        line_total: line.qty_remaining * line.unit_price,
        shipping: 0,
        item_status: "not_ordered",
        qty_shipped: 0,
        qty_received: 0,
      });
      allLineItemIds.add(line.id);
    }

    await recalcPurchaseOrderEconomics(supabase, poId);
    created.push(poId);
  }

  for (const lineItemId of allLineItemIds) {
    await rollupBomLineQuantities(supabase, lineItemId);
  }

  return NextResponse.json({ ok: true, created, warnings }, { status: 201 });
}
