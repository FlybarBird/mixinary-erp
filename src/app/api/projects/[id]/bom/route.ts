import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canEditPricing, getCurrentProfile } from "@/lib/auth";
import { writeAuditEvent } from "@/lib/projects/workspace";

type Client = Awaited<ReturnType<typeof createClient>>;

async function unlinkAndDeleteLines(
  supabase: Client,
  projectId: string,
  ids: string[],
) {
  if (!ids.length) return null;

  const { error: poErr } = await supabase
    .from("purchase_order_items")
    .update({ line_item_id: null })
    .in("line_item_id", ids);
  if (poErr) return poErr;

  const { error: quoteErr } = await supabase
    .from("quote_extracted_lines")
    .update({ matched_line_item_id: null })
    .in("matched_line_item_id", ids);
  if (quoteErr) return quoteErr;

  const { error: attErr } = await supabase
    .from("attachments")
    .delete()
    .eq("entity_type", "line_item")
    .in("entity_id", ids);
  if (attErr) return attErr;

  const { error } = await supabase
    .from("line_items")
    .delete()
    .eq("project_id", projectId)
    .in("id", ids);
  return error;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const supabase = await createClient();
  const pricingEditor = canEditPricing(profile.role);

  const sections = (body.sections ?? []) as Array<{
    id: string;
    name: string;
    sort_order: number;
  }>;
  const lines = (body.lines ?? []) as Array<Record<string, unknown>>;

  if (pricingEditor) {
    const [{ data: existingLines }, { data: existingSections }] =
      await Promise.all([
        supabase.from("line_items").select("id").eq("project_id", projectId),
        supabase
          .from("project_sections")
          .select("id")
          .eq("project_id", projectId),
      ]);

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

    const keptLineIds = new Set<string>();
    for (const [index, line] of lines.entries()) {
      const sectionId = line.section_id
        ? sectionIdMap.get(String(line.section_id)) ?? null
        : null;
      const payload = {
        project_id: projectId,
        section_id: sectionId,
        sort_order: index,
        description: String(line.description ?? ""),
        sku: (line.sku as string | null) ?? null,
        category: (line.category as string | null) ?? null,
        uom: (line.uom as string | null) || "ea",
        qty: Number(line.qty ?? 0),
        msrp: Number(line.msrp ?? 0),
        quote: line.quote == null ? null : Number(line.quote),
        override_pct:
          line.override_pct == null ? null : Number(line.override_pct),
        estimated_unit_cost:
          line.estimated_unit_cost == null || line.estimated_unit_cost === ""
            ? null
            : Number(line.estimated_unit_cost),
        required_by_date: (line.required_by_date as string | null) || null,
        vendor_id: (line.vendor_id as string | null) ?? null,
        catalog_part_id: (line.catalog_part_id as string | null) ?? null,
        order_status: (line.order_status as string) || "none",
        tracking: (line.tracking as string | null) ?? null,
        notes: (line.notes as string | null) ?? null,
      };

      if (String(line.id).startsWith("new-")) {
        const { error } = await supabase.from("line_items").insert(payload);
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
      } else {
        keptLineIds.add(String(line.id));
        const { error } = await supabase
          .from("line_items")
          .update(payload)
          .eq("id", String(line.id))
          .eq("project_id", projectId);
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
      }
    }

    const toDeleteLines = (existingLines ?? [])
      .map((row) => String(row.id))
      .filter((id) => !keptLineIds.has(id));
    const deleteErr = await unlinkAndDeleteLines(
      supabase,
      projectId,
      toDeleteLines,
    );
    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 400 });
    }

    const keptSectionIds = new Set(sectionIdMap.values());
    const toDeleteSections = (existingSections ?? [])
      .map((row) => String(row.id))
      .filter((id) => !keptSectionIds.has(id));
    if (toDeleteSections.length) {
      const { error: clearErr } = await supabase
        .from("line_items")
        .update({ section_id: null })
        .eq("project_id", projectId)
        .in("section_id", toDeleteSections);
      if (clearErr) {
        return NextResponse.json({ error: clearErr.message }, { status: 400 });
      }
      const { error: sectionErr } = await supabase
        .from("project_sections")
        .delete()
        .eq("project_id", projectId)
        .in("id", toDeleteSections);
      if (sectionErr) {
        return NextResponse.json({ error: sectionErr.message }, { status: 400 });
      }
    }

    await writeAuditEvent(supabase, {
      projectId,
      entityType: "line_items",
      entityId: projectId,
      action: "bom_batch_save",
      before: { count: existingLines?.length ?? 0 },
      after: {
        count: lines.length,
        deleted: toDeleteLines.length,
        sectionsDeleted: toDeleteSections.length,
      },
      actorId: profile.id,
    });
  } else {
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
    lines: savedLines ?? [],
  });
}
