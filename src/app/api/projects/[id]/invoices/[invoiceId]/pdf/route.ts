import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canViewFinancials, getCurrentProfile } from "@/lib/auth";
import { canAccessProject } from "@/lib/project-access";
import { buildInvoicePdf } from "@/lib/projects/export-invoice-pdf";
import { invoiceLinesFromBomAndLabor } from "@/lib/projects/invoice-from-bom-labor";
import type { LaborEntry, LineItem, ProjectSection } from "@/lib/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; invoiceId: string }> },
) {
  const { id: projectId, invoiceId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await canAccessProject(profile.id, profile.role, projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!canViewFinancials(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const [
    { data: project },
    { data: invoice },
    { data: sections },
    { data: bomLines },
    { data: laborEntries },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("project_number, name, default_override_pct, clients(name)")
      .eq("id", projectId)
      .maybeSingle(),
    supabase
      .from("project_invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("project_id", projectId)
      .maybeSingle(),
    supabase
      .from("project_sections")
      .select("id, name, sort_order")
      .eq("project_id", projectId)
      .order("sort_order"),
    supabase
      .from("line_items")
      .select(
        "section_id, category, description, qty, msrp, quote, override_pct",
      )
      .eq("project_id", projectId),
    supabase.from("labor_entries").select("*").eq("project_id", projectId),
  ]);

  if (!project || !invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const clientName =
    (project.clients as { name?: string } | null)?.name ?? null;

  const lines = invoiceLinesFromBomAndLabor({
    sections: (sections ?? []) as ProjectSection[],
    bomLines: (bomLines ?? []) as LineItem[],
    laborEntries: (laborEntries ?? []) as LaborEntry[],
    projectDefaultOverridePct: Number(project.default_override_pct ?? 0),
  });

  const pdf = await buildInvoicePdf({
    projectNumber: String(project.project_number),
    projectName: String(project.name),
    clientName,
    invoiceNumber: String(invoice.invoice_number),
    invoiceDate: String(invoice.invoice_date),
    dueDate: invoice.due_date ? String(invoice.due_date) : null,
    status: String(invoice.status),
    tax: Number(invoice.tax || 0),
    notes: invoice.notes ? String(invoice.notes) : null,
    lines,
  });

  const safeName = String(invoice.invoice_number).replace(/[^\w.-]+/g, "_");
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
    },
  });
}
