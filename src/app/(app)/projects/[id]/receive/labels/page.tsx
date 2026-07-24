import { notFound } from "next/navigation";
import { canManageProcurement, canReceive, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { QrLabelSheet } from "@/components/QrLabelSheet";

export default async function ReceiveLabelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ po?: string }>;
}) {
  const { id: projectId } = await params;
  const { po: poId } = await searchParams;
  const profile = await requireProfile();

  if (!canReceive(profile.role) && !canManageProcurement(profile.role)) {
    notFound();
  }
  if (!poId) notFound();

  const supabase = await createClient();
  const { data: po } = await supabase
    .from("purchase_orders")
    .select("id, po_number, project_id, vendors(code, name)")
    .eq("id", poId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!po) notFound();

  const { data: items } = await supabase
    .from("purchase_order_items")
    .select("id, description, sku, qty_ordered")
    .eq("po_id", poId)
    .order("description");

  const vendor = po.vendors as { code?: string; name?: string } | null;
  const vendorName = vendor
    ? `${vendor.code ?? ""} — ${vendor.name ?? ""}`.replace(/^ — /, "").trim()
    : "Vendor";

  return (
    <QrLabelSheet
      projectId={projectId}
      poNumber={String(po.po_number || "")}
      vendorName={vendorName}
      items={(items ?? []).map((i) => ({
        id: i.id,
        description: String(i.description || ""),
        sku: i.sku ?? null,
        qty_ordered: Number(i.qty_ordered || 0),
      }))}
    />
  );
}
