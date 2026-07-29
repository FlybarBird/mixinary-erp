import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canManageProcurement } from "@/lib/auth";
import {
  redactPoItemMoney,
  redactPurchaseOrderMoney,
} from "@/lib/money-redaction";
import { requireProjectApiContext } from "@/lib/project-guard";
import { newId } from "@/lib/local/db";
import { rollupBomLineQuantities } from "@/lib/projects/workspace";
import { recalcPurchaseOrderEconomics } from "@/lib/projects/procurement";
import { allocateNextPoNumber } from "@/lib/projects/numbering";
import { rebuildProjectCostLedger } from "@/lib/projects/cost-ledger";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const ctx = await requireProjectApiContext(projectId);
  if (ctx instanceof NextResponse) return ctx;

  const supabase = await createClient();

  const { data: orders, error } = await supabase
    .from("purchase_orders")
    .select("*, vendors(id, code, name, contact_name, contact_email)")
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

  const result = (orders ?? []).map((o) => {
    const base = ctx.canViewMoney ? o : redactPurchaseOrderMoney(o);
    const poItems = (itemsByPo.get(o.id) ?? []).map((item) =>
      ctx.canViewMoney
        ? item
        : redactPoItemMoney(item as Record<string, unknown>),
    );
    return { ...base, items: poItems };
  });

  return NextResponse.json({ data: result });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const ctx = await requireProjectApiContext(projectId);
  if (ctx instanceof NextResponse) return ctx;
  const profile = ctx.profile;
  if (!ctx.canEdit(canManageProcurement)) {
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

  // Auto-generate po_number from project #: PO-26070101
  let poNumber: string = body.po_number ?? "";
  if (!poNumber) {
    poNumber = await allocateNextPoNumber(supabase, projectId);
  }

  const subtotal = items.reduce(
    (s, i) => s + Number(i.qty_ordered || 0) * Number(i.unit_price || 0),
    0,
  );

  const { data: vendorRow } = await supabase
    .from("vendors")
    .select("contact_email, contact_name")
    .eq("id", vendor_id)
    .maybeSingle();
  const vendorContact =
    String(vendorRow?.contact_email || "").trim() ||
    String(vendorRow?.contact_name || "").trim() ||
    null;

  const poId = newId();
  const { error: poError } = await supabase.from("purchase_orders").insert({
    id: poId,
    project_id: projectId,
    vendor_id,
    po_number: poNumber,
    order_date: order_date ?? null,
    ordered_by: profile.id,
    status: "draft",
    vendor_contact: vendorContact,
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

  await recalcPurchaseOrderEconomics(supabase, poId);

  try {
    await rebuildProjectCostLedger(supabase, projectId);
  } catch {
    // non-fatal
  }

  const { data: po } = await supabase
    .from("purchase_orders")
    .select("*, vendors(id, code, name, contact_name, contact_email)")
    .eq("id", poId)
    .maybeSingle();

  const { data: poItems } = await supabase
    .from("purchase_order_items")
    .select("*")
    .eq("po_id", poId);

  const safePo = ctx.canViewMoney
    ? po
    : redactPurchaseOrderMoney((po ?? {}) as Record<string, unknown>);
  const safeItems = (poItems ?? []).map((item) =>
    ctx.canViewMoney ? item : redactPoItemMoney(item),
  );
  return NextResponse.json(
    { data: { ...safePo, items: safeItems } },
    { status: 201 },
  );
}
