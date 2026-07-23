import { NextResponse } from "next/server";
import { canManageAdmin, getCurrentProfile } from "@/lib/auth";
import { parseMasterWorkbook } from "@/lib/import/excel";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canManageAdmin(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Excel file required" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = await parseMasterWorkbook(buffer);
  const supabase = await createClient();

  let carriersUpserted = 0;
  for (const carrier of parsed.carriers) {
    const { error } = await supabase.from("carriers").upsert(
      { name: carrier.name, slug: carrier.slug },
      { onConflict: "slug" },
    );
    if (!error) carriersUpserted += 1;
  }

  const { data: vendors } = await supabase.from("vendors").select("id, code");
  const vendorByCode = new Map(
    (vendors ?? []).map((v) => [v.code.toLowerCase(), v.id]),
  );

  let templatesCreated = 0;
  for (const template of parsed.templates) {
    const { data: existing } = await supabase
      .from("project_templates")
      .select("id")
      .eq("name", template.name)
      .maybeSingle();
    if (existing) continue;

    const { data: created } = await supabase
      .from("project_templates")
      .insert({
        name: template.name,
        description: "Imported from master workbook",
        default_override_pct: template.defaultOverridePct,
      })
      .select("id")
      .single();
    if (!created) continue;

    const sectionNames = [...new Set(template.lines.map((l) => l.sectionName))];
    const sectionMap = new Map<string, string>();
    for (const [index, name] of sectionNames.entries()) {
      const { data: section } = await supabase
        .from("template_sections")
        .insert({
          template_id: created.id,
          name,
          sort_order: index,
        })
        .select("id")
        .single();
      if (section) sectionMap.set(name, section.id);
    }

    await supabase.from("template_line_items").insert(
      template.lines.map((line, index) => ({
        template_id: created.id,
        section_id: sectionMap.get(line.sectionName) ?? null,
        sort_order: index,
        description: line.description,
        qty: line.qty,
        msrp: line.msrp,
        quote: line.quote,
        override_pct: line.overridePct,
        vendor_code: line.vendorCode,
        notes: line.notes,
      })),
    );
    templatesCreated += 1;
  }

  let projectsCreated = 0;
  let projectsSkipped = 0;

  for (const project of parsed.projects) {
    const { data: existing } = await supabase
      .from("projects")
      .select("id")
      .eq("project_number", project.projectNumber)
      .maybeSingle();
    if (existing) {
      projectsSkipped += 1;
      continue;
    }

    let clientId: string | null = null;
    const { data: existingClient } = await supabase
      .from("clients")
      .select("id")
      .ilike("name", project.clientName)
      .maybeSingle();
    if (existingClient) {
      clientId = existingClient.id;
    } else {
      const { data: createdClient } = await supabase
        .from("clients")
        .insert({ name: project.clientName })
        .select("id")
        .single();
      clientId = createdClient?.id ?? null;
    }

    const { data: createdProject } = await supabase
      .from("projects")
      .insert({
        project_number: project.projectNumber,
        name: project.name,
        client_id: clientId,
        default_override_pct: project.defaultOverridePct,
        created_by: profile.id,
        status: "active",
        notes: `Imported from sheet: ${project.sheetName}`,
      })
      .select("id")
      .single();

    if (!createdProject) continue;

    const sectionNames = [...new Set(project.lines.map((l) => l.sectionName))];
    const sectionMap = new Map<string, string>();
    for (const [index, name] of sectionNames.entries()) {
      const { data: section } = await supabase
        .from("project_sections")
        .insert({
          project_id: createdProject.id,
          name,
          sort_order: index,
        })
        .select("id")
        .single();
      if (section) sectionMap.set(name, section.id);
    }

    await supabase.from("line_items").insert(
      project.lines.map((line, index) => ({
        project_id: createdProject.id,
        section_id: sectionMap.get(line.sectionName) ?? null,
        sort_order: index,
        description: line.description,
        qty: line.qty,
        msrp: line.msrp,
        quote: line.quote,
        override_pct: line.overridePct,
        vendor_id: line.vendorCode
          ? vendorByCode.get(line.vendorCode.toLowerCase()) ?? null
          : null,
        order_status: line.orderStatus,
        tracking: line.tracking,
        notes: line.notes,
      })),
    );
    projectsCreated += 1;
  }

  return NextResponse.json({
    ok: true,
    carriersUpserted,
    templatesCreated,
    projectsCreated,
    projectsSkipped,
    projectCount: parsed.projects.length,
  });
}
