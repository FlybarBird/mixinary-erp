import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canEditLabor, canApproveLabor, getCurrentProfile } from "@/lib/auth";
import { writeAuditEvent } from "@/lib/projects/workspace";

function computeTotalCost(body: {
  regular_hours?: number | null;
  overtime_hours?: number | null;
  actual_hours?: number | null;
  hourly_rate: number;
}): number {
  const rate = Number(body.hourly_rate ?? 0);
  const reg = Number(body.regular_hours ?? 0);
  const ot = Number(body.overtime_hours ?? 0);
  const actual = Number(body.actual_hours ?? 0);
  if (reg > 0 || ot > 0) {
    return (reg + ot * 1.5) * rate;
  }
  return actual * rate;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const { id: projectId, entryId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canEditLabor(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("labor_entries")
    .select("*")
    .eq("id", entryId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();

  const regular_hours = body.regular_hours !== undefined ? Number(body.regular_hours) : Number(existing.regular_hours ?? 0);
  const overtime_hours = body.overtime_hours !== undefined ? Number(body.overtime_hours) : Number(existing.overtime_hours ?? 0);
  const actual_hours = body.actual_hours !== undefined ? Number(body.actual_hours) : Number(existing.actual_hours ?? 0);
  const hourly_rate = body.hourly_rate !== undefined ? Number(body.hourly_rate) : Number(existing.hourly_rate ?? 0);
  const total_cost = computeTotalCost({ regular_hours, overtime_hours, actual_hours, hourly_rate });

  const updates: Record<string, unknown> = {
    worker_name: body.worker_name !== undefined ? String(body.worker_name) : existing.worker_name,
    work_category: body.work_category !== undefined ? (body.work_category as string | null) : existing.work_category,
    task_description: body.task_description !== undefined ? (body.task_description as string | null) : existing.task_description,
    work_date: body.work_date !== undefined ? String(body.work_date) : existing.work_date,
    estimated_hours: body.estimated_hours !== undefined ? Number(body.estimated_hours) : Number(existing.estimated_hours ?? 0),
    actual_hours,
    regular_hours,
    overtime_hours,
    hourly_rate,
    total_cost,
    notes: body.notes !== undefined ? (body.notes as string | null) : existing.notes,
  };

  if (body.approval_status !== undefined) {
    if (!canApproveLabor(profile.role)) {
      return NextResponse.json({ error: "Cannot approve labor without approval permission" }, { status: 403 });
    }
    updates.approval_status = body.approval_status;
  }

  const { data, error } = await supabase
    .from("labor_entries")
    .update(updates)
    .eq("id", entryId)
    .eq("project_id", projectId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAuditEvent(supabase, {
    projectId,
    entityType: "labor_entry",
    entityId: entryId,
    action: "update",
    before: existing,
    after: data,
    actorId: profile.id,
  });

  return NextResponse.json({ entry: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const { id: projectId, entryId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canEditLabor(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("labor_entries")
    .select("*")
    .eq("id", entryId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("labor_entries")
    .delete()
    .eq("id", entryId)
    .eq("project_id", projectId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAuditEvent(supabase, {
    projectId,
    entityType: "labor_entry",
    entityId: entryId,
    action: "delete",
    before: existing,
    actorId: profile.id,
  });

  return NextResponse.json({ ok: true });
}
