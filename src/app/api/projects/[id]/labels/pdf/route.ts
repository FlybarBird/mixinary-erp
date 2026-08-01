import { NextResponse } from "next/server";
import type { LabelMode } from "@mixinary/domain";
import { canManageProcurement, canReceive, getCurrentProfile } from "@/lib/auth";
import { canAccessProject } from "@/lib/project-access";
import { createClient } from "@/lib/supabase/server";
import { buildBrotherLabelPdf } from "@/lib/labels/brother-pdf";

async function authorizeLabels(projectId: string) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!(await canAccessProject(profile.id, profile.role, projectId))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (!canReceive(profile.role) && !canManageProcurement(profile.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { profile };
}

function appOrigin(request: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (env) return env;
  return new URL(request.url).origin;
}

/** Brother-sized multi-page PDF for QL 62mm stock (iPad AirPrint / Brother SDK). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const gate = await authorizeLabels(projectId);
  if ("error" in gate && gate.error) return gate.error;

  const url = new URL(request.url);
  const poId = url.searchParams.get("po");
  const mode: LabelMode =
    url.searchParams.get("mode") === "item" ? "item" : "receive";
  if (!poId) {
    return NextResponse.json({ error: "po required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: po } = await supabase
    .from("purchase_orders")
    .select("id, po_number, project_id, vendors(code, name)")
    .eq("id", poId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!po) {
    return NextResponse.json({ error: "PO not found" }, { status: 404 });
  }

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

  const { buffer, rowCount, truncated } = await buildBrotherLabelPdf({
    projectId,
    poNumber: String(po.po_number || ""),
    vendorName,
    jobName,
    mode,
    origin: appOrigin(request),
    items: (items ?? []).map((i) => ({
      id: i.id,
      description: String(i.description || ""),
      sku: i.sku ?? null,
      qty_ordered: Number(i.qty_ordered || 0),
    })),
  });

  const filename = `mixinary-${mode}-labels-${po.po_number || poId}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "X-Mixinary-Label-Count": String(rowCount),
      "X-Mixinary-Label-Truncated": truncated ? "1" : "0",
      "X-Mixinary-Printer": "brother-ql-62mm",
    },
  });
}
