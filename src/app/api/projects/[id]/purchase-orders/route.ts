import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canManageProcurement, getCurrentProfile } from "@/lib/auth";
import { newId } from "@/lib/local/db";
import { rollupBomLineQuantities } from "@/lib/projects/workspace";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();

  const { data: orders, error } = await supabase
    .from("purchase_orders")
    .select("*, vendors(id, code, name)")
    .eq("project_id", projectId)
    .order("po_number");

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const poIds = (orders ?? []).map((o) => o.id);
  let items: unknown[] = [];
  if (poIds.length > 0) {
    const { data } = await supabase
      .from("purchase_order_items")
      .select("*")
      .in("po_id", poIds);
    items = data ?? [];
  }

  const itemsByPo = new Map<string, unknown[]>();
  for (const item of items) {
    const i = item as { po_id: string };
    if (!itemsByPo.has(i.po_id)) itemsByPo.set(i.po_id, []);
    itemsByPo.get(i.po_id)!.push(item);
  }

  const result = (orders ?? []).map((o) => ({
    ...o,
    items: itemsByPo.get(o.id) ?? [],
  }));

  return NextResponse.json({ data: result });
}

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
  const { vendor_id, order_date, items = [] } = body as {
    vendor_id: string;
    po_number?: string;
    order_date?: string;
    items: Array<{
      line_item_id?: string | null;
      description?: string;
      sku?: string;
      qty_ordered: number;
      unit_price: number;
      shipping?: number;
    }>;
  };

  if (!vendor_id) return NextResponse.json({ error: "vendor_id required" }, { status: 400 });

  const supabase = await createClient();

  // Auto-generate po_number
  let poNumber: string = body.po_number ?? "";
  if (!poNumber) {
    const { data: existing } = await supabase
      .from("purchase_orders")
      .select("po_number")
      .eq("project_id", projectId);
    const nums = (existing ?? [])
      .map((r) => {
        const m = String(r.po_number ?? "").match(/^PO-(\d+)$/);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter(Boolean);
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    poNumber = `PO-${String(next).padStart(3, "0")}`;
  }

  const subtotal = items.reduce(
    (s, i) => s + Number(i.qty_ordered || 0) * Number(i.unit_price || 0),
    0,
  );

  const poId = newId();
  const { error: poError } = await supabase.from("purchase_orders").insert({
    id: poId,
    project_id: projectId,
    vendor_id,
    po_number: poNumber,
    order_date: order_date ?? null,
    ordered_by: profile.id,
    status: "draft",
    subtotal,
    total: subtotal,
  });

  if (poError) return NextResponse.json({ error: poError.message }, { status: 400 });

  const lineItemIds = new Set<string>();
  for (const item of items) {
    const lineTotal = Number(item.qty_ordered || 0) * Number(item.unit_price || 0);
    const { error: itemError } = await supabase.from("purchase_order_items").insert({
      id: newId(),
      po_id: poId,
      line_item_id: item.line_item_id ?? null,
      description: item.description ?? "",
      sku: item.sku ?? null,
      qty_ordered: Number(item.qty_ordered || 0),
      unit_price: Number(item.unit_price || 0),
      line_total: lineTotal,
      shipping: Number(item.shipping || 0),
      item_status: "not_ordered",
      qty_shipped: 0,
      qty_received: 0,
    });
    if (itemError) return NextResponse.json({ error: itemError.message }, { status: 400 });
    if (item.line_item_id) lineItemIds.add(item.line_item_id);
  }

  for (const lineItemId of lineItemIds) {
    await rollupBomLineQuantities(supabase, lineItemId);
  }

  const { data: po } = await supabase
    .from("purchase_orders")
    .select("*, vendors(id, code, name)")
    .eq("id", poId)
    .maybeSingle();

  const { data: poItems } = await supabase
    .from("purchase_order_items")
    .select("*")
    .eq("po_id", poId);

  return NextResponse.json({ data: { ...po, items: poItems ?? [] } }, { status: 201 });
}
