import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

function esc(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(cols: unknown[]): string {
  return cols.map(esc).join(",");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("purchase_orders")
    .select("*, vendors(code, name), purchase_order_items(*)")
    .eq("project_id", projectId)
    .order("created_at");

  const headers = [
    "PO Number",
    "Vendor",
    "Status",
    "Order Date",
    "Expected Delivery",
    "PO Shipping",
    "PO Tax",
    "PO Total",
    "Item Description",
    "SKU",
    "Qty Ordered",
    "Unit Price",
    "Line Total",
    "Item Status",
    "Qty Received",
    "Notes",
  ];

  const rows: unknown[][] = [];
  for (const po of orders ?? []) {
    const vendor = (po.vendors as { code?: string; name?: string } | null)?.name ?? "";
    const items = (po.purchase_order_items ?? []) as Array<Record<string, unknown>>;
    const poShipping = Number(po.shipping || 0);
    const poTax = Number(po.tax || 0);
    const poTotal = Number(po.total || 0);
    if (items.length === 0) {
      rows.push([
        po.po_number,
        vendor,
        po.status,
        po.order_date ?? "",
        po.expected_delivery_date ?? "",
        poShipping,
        poTax,
        poTotal,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        po.notes ?? "",
      ]);
    } else {
      for (const item of items) {
        rows.push([
          po.po_number,
          vendor,
          po.status,
          po.order_date ?? "",
          po.expected_delivery_date ?? "",
          poShipping,
          poTax,
          poTotal,
          item.description,
          item.sku ?? "",
          item.qty_ordered,
          item.unit_price,
          item.line_total,
          item.item_status,
          item.qty_received,
          item.notes ?? "",
        ]);
      }
    }
  }

  const csv = [row(headers), ...rows.map(row)].join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="procurement-${projectId}.csv"`,
    },
  });
}
