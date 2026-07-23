import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canEditLabor, getCurrentProfile } from "@/lib/auth";
import { newId } from "@/lib/local/db";
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("labor_entries")
    .select("*")
    .eq("project_id", projectId)
    .order("work_date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: data ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canEditLabor(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const supabase = await createClient();

  const regular_hours = Number(body.regular_hours ?? 0);
  const overtime_hours = Number(body.overtime_hours ?? 0);
  const actual_hours = Number(body.actual_hours ?? 0);
  const hourly_rate = Number(body.hourly_rate ?? 0);
  const total_cost = computeTotalCost({ regular_hours, overtime_hours, actual_hours, hourly_rate });

  const entry = {
    id: newId(),
    project_id: projectId,
    worker_name: String(body.worker_name ?? ""),
    user_id: (body.user_id as string | null) ?? null,
    work_category: (body.work_category as string | null) ?? null,
    task_description: (body.task_description as string | null) ?? null,
    work_date: String(body.work_date ?? new Date().toISOString().slice(0, 10)),
    estimated_hours: Number(body.estimated_hours ?? 0),
    actual_hours,
    regular_hours,
    overtime_hours,
    hourly_rate,
    total_cost,
    approval_status: "pending" as const,
    notes: (body.notes as string | null) ?? null,
    created_by: profile.id,
  };

  const { data, error } = await supabase
    .from("labor_entries")
    .insert(entry)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAuditEvent(supabase, {
    projectId,
    entityType: "labor_entry",
    entityId: entry.id,
    action: "create",
    after: data,
    actorId: profile.id,
  });

  return NextResponse.json({ entry: data }, { status: 201 });
}
