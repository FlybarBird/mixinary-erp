import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  canEditClientDocuments,
  canViewFinancials,
  getCurrentProfile,
} from "@/lib/auth";
import { canAccessProject } from "@/lib/project-access";
import { calculateLinePricing } from "@/lib/pricing";
import type { LaborEntry, LineItem, ProjectSection } from "@/lib/types";

/**
 * Customer-facing snapshot of BOM + labor for the pricing-block import modal.
 *
 * Sale prices are computed server-side; vendor cost, quote cost, procurement
 * status, burden, margin, and profit never leave this route.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await canAccessProject(profile.id, profile.role, projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!canViewFinancials(profile.role) || !canEditClientDocuments(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const [{ data: project }, { data: sections }, { data: lines }, { data: labor }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("id, default_override_pct")
        .eq("id", projectId)
        .maybeSingle(),
      supabase
        .from("project_sections")
        .select("id, name, sort_order")
        .eq("project_id", projectId)
        .order("sort_order"),
      supabase
        .from("line_items")
        .select("id, section_id, sort_order, description, category, qty, msrp, quote, override_pct")
        .eq("project_id", projectId)
        .order("sort_order"),
      supabase
        .from("labor_entries")
        .select("id, work_category, task_description, qty, msrp, quote, override_pct, hourly_rate, sort_order")
        .eq("project_id", projectId)
        .order("sort_order"),
    ]);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const defaultOverridePct = Number(project.default_override_pct ?? 0);

  const toCustomerLine = (line: Partial<LineItem>) => {
    const pricing = calculateLinePricing({
      qty: line.qty,
      msrp: line.msrp,
      quote: line.quote,
      overridePct: line.override_pct,
      projectDefaultOverridePct: defaultOverridePct,
    });
    return {
      id: String(line.id),
      name: String(line.description ?? "").trim() || "Item",
      category: (line.category as string | null) ?? null,
      qty: pricing.qty,
      unit_price: Math.round(pricing.unitSale * 100) / 100,
      total: Math.round(pricing.totalSale * 100) / 100,
    };
  };

  const bySection = new Map<string | null, ReturnType<typeof toCustomerLine>[]>();
  for (const raw of (lines ?? []) as Partial<LineItem>[]) {
    const key = (raw.section_id as string | null) ?? null;
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key)!.push(toCustomerLine(raw));
  }

  const sectionRows = ((sections ?? []) as ProjectSection[]).map((s) => ({
    id: s.id,
    name: s.name,
    lines: bySection.get(s.id) ?? [],
  }));
  const unsectioned = bySection.get(null) ?? [];
  if (unsectioned.length) {
    sectionRows.push({ id: "unsectioned", name: "Other items", lines: unsectioned });
  }

  const laborLines = ((labor ?? []) as Partial<LaborEntry>[]).map((entry) => {
    const pricing = calculateLinePricing({
      qty: entry.qty ?? 1,
      msrp: entry.msrp ?? entry.hourly_rate,
      quote: entry.quote,
      overridePct: entry.override_pct,
      projectDefaultOverridePct: defaultOverridePct,
    });
    const name =
      String(entry.task_description ?? "").trim() ||
      String(entry.work_category ?? "").trim() ||
      "Labor";
    return {
      id: String(entry.id),
      name,
      category: (entry.work_category as string | null) ?? "Labor",
      qty: pricing.qty,
      unit_price: Math.round(pricing.unitSale * 100) / 100,
      total: Math.round(pricing.totalSale * 100) / 100,
    };
  });

  return NextResponse.json({ sections: sectionRows, labor: laborLines });
}
