import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProjectApiContext } from "@/lib/project-guard";

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
  const ctx = await requireProjectApiContext(projectId);
  if (ctx instanceof NextResponse) return ctx;
  const canMoney = ctx.canViewMoney;

  const supabase = await createClient();

  const [{ data: sections }, { data: lines }] = await Promise.all([
    supabase.from("project_sections").select("id, name, sort_order").eq("project_id", projectId).order("sort_order"),
    supabase
      .from("line_items")
      .select("*, vendors(code, name)")
      .eq("project_id", projectId)
      .order("sort_order"),
  ]);

  const sectionMap = new Map((sections ?? []).map((s) => [s.id, s.name]));

  const headers = [
    "Section",
    "Sort Order",
    "Description",
    "SKU",
    "Category",
    "Qty",
    ...(canMoney
      ? [
          "MSRP",
          "Quote Price",
          "Est. Unit Cost",
          "Total MSRP",
          "Total Quote",
        ]
      : []),
    "Vendor",
    "Procurement Status",
    "Qty Ordered",
    "Qty Received",
    "Order Status",
    "Tracking",
    "Notes",
  ];

  const rows = (lines ?? []).map((l) => [
    sectionMap.get(l.section_id) ?? "",
    l.sort_order,
    l.description,
    l.sku ?? "",
    l.category ?? "",
    l.qty,
    ...(canMoney
      ? [
          l.msrp,
          l.quote ?? "",
          l.estimated_unit_cost ?? "",
          Number(l.msrp) * Number(l.qty),
          l.quote != null ? Number(l.quote) * Number(l.qty) : "",
        ]
      : []),
    (l.vendors as { code?: string; name?: string } | null)?.name ?? "",
    l.procurement_status ?? "",
    l.qty_ordered ?? 0,
    l.qty_received ?? 0,
    l.order_status ?? "",
    l.tracking ?? "",
    l.notes ?? "",
  ]);

  const csv = [row(headers), ...rows.map(row)].join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="bom-${projectId}.csv"`,
    },
  });
}
