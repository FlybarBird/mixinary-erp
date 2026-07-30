import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, canManageProjects } from "@/lib/auth";
import { addProjectMember, listAccessibleProjectIds } from "@/lib/project-access";
import { allocateNextProjectNumber } from "@/lib/projects/numbering";
import type { ProjectStatus } from "@/lib/types";

/** List projects accessible to the current user (cookie or Bearer JWT). */
export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status");
  const showArchived = statusFilter === "archived";
  const showAll = statusFilter === "all";

  const supabase = await createClient();
  const accessible = await listAccessibleProjectIds(profile.id, profile.role);

  let projectsQuery = supabase
    .from("projects")
    .select(
      "id, project_number, name, status, default_override_pct, client_id, clients(id, name)",
    )
    .order("project_number", { ascending: false });

  if (accessible !== "all") {
    if (accessible.length === 0) {
      projectsQuery = projectsQuery.eq("id", "__none__");
    } else {
      projectsQuery = projectsQuery.in("id", accessible);
    }
  }

  if (showArchived) {
    projectsQuery = projectsQuery.eq("status", "archived");
  } else if (!showAll) {
    projectsQuery = projectsQuery.neq("status", "archived");
  }

  const { data: projects, error } = await projectsQuery;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    projects: (projects ?? []).map((p) => {
      const client = Array.isArray(p.clients) ? p.clients[0] : p.clients;
      return {
        id: p.id,
        project_number: p.project_number,
        name: p.name,
        status: p.status as ProjectStatus,
        default_override_pct: p.default_override_pct,
        client_id: p.client_id,
        client_name: (client as { name?: string } | null)?.name ?? null,
      };
    }),
    can_manage: canManageProjects(profile.role),
  });
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canManageProjects(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const supabase = await createClient();

  const requestedNumber = String(body.project_number ?? "").trim();
  const projectNumber =
    requestedNumber || (await allocateNextProjectNumber(supabase));

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      project_number: projectNumber,
      name: String(body.name).trim(),
      client_id: body.client_id || null,
      default_override_pct: Number(body.default_override_pct ?? 0),
      created_by: profile.id,
      status: "active",
    })
    .select("id, project_number")
    .single();

  if (error || !project) {
    return NextResponse.json(
      { error: error?.message || "Failed to create project" },
      { status: 400 },
    );
  }

  await addProjectMember({
    projectId: project.id,
    userId: profile.id,
    accessRole: "manager",
  });

  if (body.template_id) {
    const { data: templateSections } = await supabase
      .from("template_sections")
      .select("*")
      .eq("template_id", body.template_id)
      .order("sort_order");
    const { data: templateLines } = await supabase
      .from("template_line_items")
      .select("*")
      .eq("template_id", body.template_id)
      .order("sort_order");
    const { data: vendors } = await supabase.from("vendors").select("id, code");
    const vendorByCode = new Map((vendors ?? []).map((v) => [v.code, v.id]));

    const sectionIdMap = new Map<string, string>();
    for (const section of templateSections ?? []) {
      const { data: created } = await supabase
        .from("project_sections")
        .insert({
          project_id: project.id,
          name: section.name,
          sort_order: section.sort_order,
        })
        .select("id")
        .single();
      if (created) sectionIdMap.set(section.id, created.id);
    }

    if (templateLines?.length) {
      await supabase.from("line_items").insert(
        templateLines.map((line, index) => ({
          project_id: project.id,
          section_id: line.section_id
            ? sectionIdMap.get(line.section_id) ?? null
            : null,
          sort_order: line.sort_order ?? index,
          description: line.description,
          sku: line.sku,
          qty: line.qty,
          msrp: line.msrp,
          quote: line.quote,
          override_pct: line.override_pct,
          vendor_id: line.vendor_code
            ? vendorByCode.get(line.vendor_code) ?? null
            : null,
          notes: line.notes,
        })),
      );
    }
  } else {
    await supabase.from("project_sections").insert({
      project_id: project.id,
      name: "Hardware",
      sort_order: 0,
    });
  }

  return NextResponse.json({ id: project.id, project_number: project.project_number });
}
