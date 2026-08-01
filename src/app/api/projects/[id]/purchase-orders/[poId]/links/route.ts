import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canManageProcurement, getCurrentProfile } from "@/lib/auth";
import {
  linkPoToProject,
  projectCanAccessPo,
  unlinkPoFromProject,
} from "@/lib/projects/po-move";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; poId: string }> },
) {
  const { id: projectId, poId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  if (!(await projectCanAccessPo(supabase, projectId, poId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: links, error } = await supabase
    .from("purchase_order_project_links")
    .select("id, po_id, project_id, is_owner, created_at")
    .eq("po_id", poId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const projectIds = [...new Set((links ?? []).map((l) => l.project_id))];
  const { data: projects } = projectIds.length
    ? await supabase
        .from("projects")
        .select("id, project_number, name")
        .in("id", projectIds)
    : { data: [] as Array<{ id: string; project_number: string; name: string }> };

  const projectById = new Map((projects ?? []).map((p) => [p.id, p]));
  const enriched = (links ?? []).map((l) => ({
    ...l,
    project: projectById.get(l.project_id) ?? null,
  }));

  const { data: candidates } = await supabase
    .from("projects")
    .select("id, project_number, name")
    .neq("id", projectId)
    .order("project_number")
    .limit(200);

  const linkedIds = new Set((links ?? []).map((l) => l.project_id));
  const shareCandidates = (candidates ?? []).filter((p) => !linkedIds.has(p.id));

  return NextResponse.json({
    data: enriched,
    shareCandidates,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; poId: string }> },
) {
  const { id: projectId, poId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageProcurement(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as { project_id?: string };
  if (!body.project_id) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }

  const supabase = await createClient();
  try {
    const result = await linkPoToProject(supabase, {
      ownerProjectId: projectId,
      poId,
      targetProjectId: body.project_id,
      actorId: profile.id,
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Share failed" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; poId: string }> },
) {
  const { id: projectId, poId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageProcurement(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  let linkedProjectId = url.searchParams.get("project_id");
  if (!linkedProjectId) {
    try {
      const body = (await request.json()) as { project_id?: string };
      linkedProjectId = body.project_id ?? null;
    } catch {
      linkedProjectId = null;
    }
  }
  if (!linkedProjectId) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }

  const supabase = await createClient();
  try {
    const result = await unlinkPoFromProject(supabase, {
      requestProjectId: projectId,
      poId,
      linkedProjectId,
      actorId: profile.id,
    });
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unshare failed" },
      { status: 400 },
    );
  }
}
