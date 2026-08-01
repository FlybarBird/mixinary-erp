import { notFound } from "next/navigation";
import { canManageProcurement, canReceive, requireProfile } from "@/lib/auth";
import { getCompanySettings } from "@/lib/company-settings";
import { createClient } from "@/lib/supabase/server";
import { QrLabelSheet, type LabelMode } from "@/components/QrLabelSheet";

export default async function ReceiveLabelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ po?: string; mode?: string }>;
}) {
  const { id: projectId } = await params;
  const { po: poId, mode: modeParam } = await searchParams;
  const profile = await requireProfile();

  if (!canReceive(profile.role) && !canManageProcurement(profile.role)) {
    notFound();
  }
  if (!poId) notFound();

  const mode: LabelMode = modeParam === "item" ? "item" : "receive";

  const supabase = await createClient();
  const [{ data: po }, company] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("id, po_number, project_id, vendors(code, name)")
      .eq("id", poId)
      .eq("project_id", projectId)
      .maybeSingle(),
    getCompanySettings(supabase),
  ]);

  if (!po) notFound();

  const [{ data: items }, { data: project }] = await Promise.all([
    supabase
      .from("purchase_order_items")
      .select("id, description, sku, qty_ordered")
      .eq("po_id", poId)
      .order("description"),
    supabase
      .from("projects")
      .select("name, project_number")
      .eq("id", projectId)
      .maybeSingle(),
  ]);

  const vendor = po.vendors as { code?: string; name?: string } | null;
  const vendorName = vendor
    ? `${vendor.code ?? ""} — ${vendor.name ?? ""}`.replace(/^ — /, "").trim()
    : "Vendor";

  const jobName =
    String(project?.name || "").trim() ||
    String(project?.project_number || "").trim() ||
    "Job";

  return (
    <QrLabelSheet
      projectId={projectId}
      poId={poId}
      poNumber={String(po.po_number || "")}
      vendorName={vendorName}
      jobName={jobName}
      mode={mode}
      labelPrinter={company.label_printer}
      items={(items ?? []).map((i) => ({
        id: i.id,
        description: String(i.description || ""),
        sku: i.sku ?? null,
        qty_ordered: Number(i.qty_ordered || 0),
      }))}
    />
  );
}
