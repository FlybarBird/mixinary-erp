import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { buildBomPdf } from "@/lib/projects/export-bom-pdf";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pricingParam = new URL(request.url).searchParams.get("pricing");
  const withPricing = !(
    pricingParam === "0" ||
    pricingParam === "false" ||
    pricingParam === "without"
  );

  const supabase = await createClient();
  const [{ data: project }, { data: sections }, { data: lines }] =
    await Promise.all([
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
        .select("*, vendors(code, name)")
        .eq("project_id", projectId)
        .order("sort_order"),
    ]);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const pdf = await buildBomPdf({
    projectNumber: project.project_number,
    projectName: project.name,
    clientName: (project.clients as { name?: string } | null)?.name ?? null,
    defaultOverridePct: Number(project.default_override_pct || 0),
    includePricing: withPricing,
    sections: sections ?? [],
    lines: (lines ?? []) as Parameters<typeof buildBomPdf>[0]["lines"],
  });

  const suffix = withPricing ? "with-pricing" : "no-pricing";
  const safeNumber = String(project.project_number).replace(/[^\w.-]+/g, "_");

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="bom-${safeNumber}-${suffix}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
