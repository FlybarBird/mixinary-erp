import { NextResponse } from "next/server";
import {
  buildLabelPrintRows,
  buildReceiveQrUrl,
  BROTHER_LABEL,
  type LabelMode,
} from "@mixinary/domain";
import { canManageProcurement, canReceive, getCurrentProfile } from "@/lib/auth";
import { canAccessProject } from "@/lib/project-access";
import { createClient } from "@/lib/supabase/server";

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

async function loadLabelSheet(
  projectId: string,
  poId: string,
  mode: LabelMode,
) {
  const supabase = await createClient();
  const { data: po } = await supabase
    .from("purchase_orders")
    .select("id, po_number, project_id, vendors(code, name)")
    .eq("id", poId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!po) return null;

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

  return {
    poId: po.id,
    poNumber: String(po.po_number || ""),
    vendorName,
    jobName,
    mode,
    items: (items ?? []).map((i) => ({
      id: i.id,
      description: String(i.description || ""),
      sku: i.sku ?? null,
      qty_ordered: Number(i.qty_ordered || 0),
    })),
  };
}

function appOrigin(request: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (env) return env;
  return new URL(request.url).origin;
}

/** Label payload for iPad Brother printing / web clients. */
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

  const sheet = await loadLabelSheet(projectId, poId, mode);
  if (!sheet) {
    return NextResponse.json({ error: "PO not found" }, { status: 404 });
  }

  const origin = appOrigin(request);
  const { rows, truncated } = buildLabelPrintRows(sheet.items, mode);
  const labels = rows.map((row) => ({
    ...row,
    qr_url: buildReceiveQrUrl({
      origin,
      projectId,
      itemId: row.itemId,
    }),
  }));

  return NextResponse.json({
    project_id: projectId,
    po_id: sheet.poId,
    po_number: sheet.poNumber,
    vendor_name: sheet.vendorName,
    job_name: sheet.jobName,
    mode,
    truncated,
    printer: {
      brand: "brother",
      label: BROTHER_LABEL,
      recommended_models: BROTHER_LABEL.recommendedModels,
    },
    labels,
  });
}
