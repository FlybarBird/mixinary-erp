import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProjectApiContext } from "@/lib/project-guard";
import { buildLaborPdf } from "@/lib/projects/export-labor-pdf";
import type { LaborEntry } from "@/lib/types";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const ctx = await requireProjectApiContext(projectId);
  if (ctx instanceof NextResponse) return ctx;

  const url = new URL(request.url);
  const wantPricing = url.searchParams.get("pricing") !== "0";
  const includePricing = wantPricing && ctx.canViewMoney;

  const supabase = await createClient();
  const [{ data: project }, { data: entries }] = await Promise.all([
    supabase
      .from("projects")
      .select("project_number, name, default_override_pct, clients(name)")
      .eq("id", projectId)
      .maybeSingle(),
    supabase.from("labor_entries").select("*").eq("project_id", projectId),
  ]);

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const clientName =
    (project.clients as { name?: string } | null)?.name ?? null;

  const pdf = await buildLaborPdf({
    projectNumber: project.project_number,
    projectName: project.name,
    clientName,
    includePricing,
    lines: (entries ?? []) as LaborEntry[],
    defaultOverridePct: Number(project.default_override_pct ?? 0),
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="labor-${project.project_number}.pdf"`,
    },
  });
}
