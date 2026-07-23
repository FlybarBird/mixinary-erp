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

  // Get PO items with tracking events for this project
  const { data: items } = await supabase
    .from("purchase_order_items")
    .select(`
      id, description, sku, item_status, qty_ordered, qty_received,
      tracking_number, tracking_url, latest_tracking_update,
      expected_ship_date, expected_delivery_date,
      purchase_orders!inner(project_id, po_number, vendors(name)),
      tracking_events(event_at, status, message)
    `)
    .eq("purchase_orders.project_id", projectId)
    .order("created_at");

  const headers = [
    "PO Number",
    "Vendor",
    "Description",
    "SKU",
    "Item Status",
    "Qty Ordered",
    "Qty Received",
    "Tracking Number",
    "Tracking URL",
    "Expected Ship",
    "Expected Delivery",
    "Latest Update",
    "Event Time",
    "Event Status",
    "Event Message",
  ];

  const rows: unknown[][] = [];
  for (const item of items ?? []) {
    const po = item.purchase_orders as { po_number?: string; vendors?: { name?: string } | null } | null;
    const events = (item.tracking_events ?? []) as Array<{ event_at: string; status: string; message: string | null }>;
    const baseRow = [
      po?.po_number ?? "",
      po?.vendors?.name ?? "",
      item.description,
      item.sku ?? "",
      item.item_status,
      item.qty_ordered,
      item.qty_received,
      item.tracking_number ?? "",
      item.tracking_url ?? "",
      item.expected_ship_date ?? "",
      item.expected_delivery_date ?? "",
      item.latest_tracking_update ?? "",
    ];
    if (events.length === 0) {
      rows.push([...baseRow, "", "", ""]);
    } else {
      for (const ev of events) {
        rows.push([...baseRow, ev.event_at, ev.status, ev.message ?? ""]);
      }
    }
  }

  const csv = [row(headers), ...rows.map(row)].join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="tracking-${projectId}.csv"`,
    },
  });
}
