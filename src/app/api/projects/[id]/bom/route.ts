import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canEditBom } from "@/lib/auth";
import { redactLineItemMoney } from "@/lib/money-redaction";
import { requireProjectApiContext } from "@/lib/project-guard";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const ctx = await requireProjectApiContext(projectId);
  if (ctx instanceof NextResponse) return ctx;

  const body = await request.json();
  const supabase = await createClient();
  const pricingEditor = ctx.canEdit(canEditBom);
  const canMoney = ctx.canViewMoney;

  const sections = (body.sections ?? []) as Array<{
    id: string;
    name: string;
    sort_order: number;
  }>;
  const lines = (body.lines ?? []) as Array<Record<string, unknown>>;

  // A money-denied editor works against redacted values; never let those
  // overwrite the stored pricing fields.
  const existingMoney = new Map<
    string,
    {
      msrp: number;
      quote: number | null;
      override_pct: number | null;
      estimated_unit_cost: number | null;
    }
  >();
  if (pricingEditor && !canMoney) {
    const { data: existing } = await supabase
      .from("line_items")
      .select("id, msrp, quote, override_pct, estimated_unit_cost")
      .eq("project_id", projectId);
    for (const row of existing ?? []) {
      existingMoney.set(String(row.id), {
        msrp: Number(row.msrp ?? 0),
        quote: row.quote == null ? null : Number(row.quote),
        override_pct:
          row.override_pct == null ? null : Number(row.override_pct),
        estimated_unit_cost:
          row.estimated_unit_cost == null
            ? null
            : Number(row.estimated_unit_cost),
      });
    }
  }

  if (pricingEditor) {
    const sectionIdMap = new Map<string, string>();
    for (const [index, section] of sections.entries()) {
      if (String(section.id).startsWith("new-section-")) {
        const { data, error } = await supabase
          .from("project_sections")
          .insert({
            project_id: projectId,
            name: section.name,
            sort_order: section.sort_order ?? index,
          })
          .select("id")
          .single();
        if (error || !data) {
          return NextResponse.json({ error: error?.message }, { status: 400 });
        }
        sectionIdMap.set(section.id, data.id);
      } else {
        await supabase
          .from("project_sections")
          .update({
            name: section.name,
            sort_order: section.sort_order ?? index,
          })
          .eq("id", section.id)
          .eq("project_id", projectId);
        sectionIdMap.set(section.id, section.id);
      }
    }

    for (const [index, line] of lines.entries()) {
      const sectionId = line.section_id
        ? sectionIdMap.get(String(line.section_id)) ?? null
        : null;
      const lineId = String(line.id);
      const isNew = lineId.startsWith("new-");
      const money = canMoney
        ? {
            msrp: Number(line.msrp ?? 0),
            quote: line.quote == null ? null : Number(line.quote),
            override_pct:
              line.override_pct == null ? null : Number(line.override_pct),
            estimated_unit_cost:
              line.estimated_unit_cost == null ||
              line.estimated_unit_cost === ""
                ? null
                : Number(line.estimated_unit_cost),
          }
        : existingMoney.get(lineId) ?? {
            msrp: 0,
            quote: null,
            override_pct: null,
            estimated_unit_cost: null,
          };
      const payload = {
        project_id: projectId,
        section_id: sectionId,
        sort_order: index,
        description: String(line.description ?? ""),
        sku: (line.sku as string | null) ?? null,
        category: (line.category as string | null) ?? null,
        uom: (line.uom as string | null) || "ea",
        qty: Number(line.qty ?? 0),
        ...money,
        required_by_date: (line.required_by_date as string | null) || null,
        vendor_id: (line.vendor_id as string | null) ?? null,
        catalog_part_id: (line.catalog_part_id as string | null) ?? null,
        order_status: (line.order_status as string) || "none",
        tracking: (line.tracking as string | null) ?? null,
        notes: (line.notes as string | null) ?? null,
      };

      if (isNew) {
        const { error } = await supabase.from("line_items").insert(payload);
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
      } else {
        const { error } = await supabase
          .from("line_items")
          .update(payload)
          .eq("id", lineId)
          .eq("project_id", projectId);
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
      }
    }
  } else {
    // Status/tracking/notes updates still require project Editor access.
    if (!ctx.canEdit(() => true)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    for (const line of lines) {
      if (String(line.id).startsWith("new-")) continue;
      const { error } = await supabase
        .from("line_items")
        .update({
          order_status: (line.order_status as string) || "none",
          tracking: (line.tracking as string | null) ?? null,
          notes: (line.notes as string | null) ?? null,
        })
        .eq("id", String(line.id))
        .eq("project_id", projectId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
  }

  await supabase
    .from("projects")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", projectId);

  const [{ data: savedSections }, { data: savedLines }] = await Promise.all([
    supabase
      .from("project_sections")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order"),
    supabase
      .from("line_items")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order"),
  ]);

  return NextResponse.json({
    ok: true,
    sections: savedSections ?? [],
    lines: (savedLines ?? []).map((l) =>
      canMoney ? l : redactLineItemMoney(l),
    ),
  });
}
