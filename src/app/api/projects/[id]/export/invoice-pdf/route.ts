import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canViewFinancials } from "@/lib/auth";
import { requireProjectApiContext } from "@/lib/project-guard";
import { buildInvoicePdf } from "@/lib/projects/export-invoice-pdf";
import { invoiceLinesFromBomAndLabor } from "@/lib/projects/invoice-from-bom-labor";
import { allocateNextInvoiceNumber } from "@/lib/projects/numbering";
import type { LaborEntry, LineItem, ProjectSection } from "@/lib/types";

/** Draft invoice PDF from BOM categories + Labor work categories (Sale). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const ctx = await requireProjectApiContext(projectId);
  if (ctx instanceof NextResponse) return ctx;
  if (!canViewFinancials(ctx.profile.role) || !ctx.canViewMoney) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const [
    { data: project },
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

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const clientName =
    (project.clients as { name?: string } | null)?.name ?? null;
  const invoiceNumber = await allocateNextInvoiceNumber(supabase, projectId);
  const today = new Date().toISOString().slice(0, 10);

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
    invoiceNumber,
    invoiceDate: today,
    dueDate: null,
    status: "draft",
    tax: 0,
    notes: "Generated from BOM categories and Labor work categories (Sale).",
    lines,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${project.project_number}.pdf"`,
    },
  });
}
