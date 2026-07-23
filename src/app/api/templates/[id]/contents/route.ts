import { NextResponse } from "next/server";
import { canEditPricing, getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: templateId } = await params;
  const profile = await getCurrentProfile();
  if (!profile || !canEditPricing(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("project_templates")
    .select("id")
    .eq("id", templateId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  if ("name" in body || "description" in body || "default_override_pct" in body) {
    const patch: Record<string, unknown> = {};
    if ("name" in body) {
      const name = String(body.name || "").trim();
      if (!name) {
        return NextResponse.json({ error: "Name is required" }, { status: 400 });
      }
      patch.name = name;
    }
    if ("description" in body) {
      patch.description = String(body.description || "").trim() || null;
    }
    if ("default_override_pct" in body) {
      const value = Number(body.default_override_pct);
      patch.default_override_pct = Number.isFinite(value) ? value : 0;
    }
    const { error } = await supabase
      .from("project_templates")
      .update(patch)
      .eq("id", templateId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  const sections = (body.sections ?? []) as Array<{
    id: string;
    name: string;
    sort_order?: number;
  }>;
  const lines = (body.lines ?? []) as Array<Record<string, unknown>>;

  // Replace contents so removals stick
  await supabase
    .from("template_line_items")
    .delete()
    .eq("template_id", templateId);
  await supabase
    .from("template_sections")
    .delete()
    .eq("template_id", templateId);

  const sectionIdMap = new Map<string, string>();
  for (const [index, section] of sections.entries()) {
    const name = String(section.name || "").trim() || `Section ${index + 1}`;
    const { data, error } = await supabase
      .from("template_sections")
      .insert({
        template_id: templateId,
        name,
        sort_order: section.sort_order ?? index,
      })
      .select("id")
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Failed to save section" },
        { status: 400 },
      );
    }
    sectionIdMap.set(section.id, data.id);
  }

  if (lines.length) {
    const rows = lines.map((line, index) => {
      const sectionId = line.section_id
        ? sectionIdMap.get(String(line.section_id)) ?? null
        : null;
      return {
        template_id: templateId,
        section_id: sectionId,
        sort_order: Number(line.sort_order ?? index),
        description: String(line.description ?? "").trim() || "Untitled item",
        sku: (line.sku as string | null) || null,
        qty: Number(line.qty ?? 1) || 0,
        msrp: Number(line.msrp ?? 0) || 0,
        quote: line.quote == null || line.quote === "" ? null : Number(line.quote),
        override_pct:
          line.override_pct == null || line.override_pct === ""
            ? null
            : Number(line.override_pct),
        vendor_code: (line.vendor_code as string | null) || null,
        notes: (line.notes as string | null) || null,
      };
    });

    const { error } = await supabase.from("template_line_items").insert(rows);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  const [{ data: savedSections }, { data: savedLines }, { data: template }] =
    await Promise.all([
      supabase
        .from("template_sections")
        .select("*")
        .eq("template_id", templateId)
        .order("sort_order"),
      supabase
        .from("template_line_items")
        .select("*")
        .eq("template_id", templateId)
        .order("sort_order"),
      supabase
        .from("project_templates")
        .select("*")
        .eq("id", templateId)
        .single(),
    ]);

  return NextResponse.json({
    ok: true,
    data: {
      template,
      sections: savedSections ?? [],
      lines: savedLines ?? [],
    },
  });
}
