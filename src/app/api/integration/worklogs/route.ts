import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyIntegrationSignature } from "@/lib/integration/client";
import { getLocalDb, isLocalMode, newId } from "@/lib/local/db";

/**
 * Ingest Huly worklogs as unapproved ERP labor.
 * Never accepts pay rates / burden from Project Management.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const sig = request.headers.get("x-mixinary-signature");
  if (!verifyIntegrationSignature(raw, sig)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = JSON.parse(raw || "{}") as {
    erpProjectId?: string;
    erpUserId?: string | null;
    hulyWorkItemId?: string;
    hulyWorklogId?: string;
    hours?: number;
    workDate?: string;
    description?: string;
  };

  if (!body.erpProjectId || !body.hulyWorklogId || body.hours == null) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const hours = Number(body.hours) || 0;
  const workDate = body.workDate || new Date().toISOString().slice(0, 10);
  const task = body.description || `Huly worklog ${body.hulyWorklogId}`;
  const externalKey = `huly-worklog:${body.hulyWorklogId}`;

  if (isLocalMode()) {
    const db = getLocalDb();
    const existing = db
      .prepare(
        `select id from labor_entries where project_id=? and notes=?`,
      )
      .get(body.erpProjectId, externalKey) as { id: string } | undefined;
    if (existing) {
      return NextResponse.json({ ok: true, duplicate: true, id: existing.id });
    }
    const id = newId();
    db.prepare(
      `insert into labor_entries (
        id, project_id, worker_name, user_id, work_category, task_description,
        work_date, estimated_hours, actual_hours, regular_hours, overtime_hours,
        hourly_rate, total_cost, approval_status, notes, created_by
      ) values (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, 0, 0, 'pending', ?, ?)`,
    ).run(
      id,
      body.erpProjectId,
      "Huly worklog",
      body.erpUserId ?? null,
      "project_management",
      task,
      workDate,
      hours,
      hours,
      externalKey,
      body.erpUserId ?? null,
    );
    return NextResponse.json({ ok: true, id, approval_status: "pending" });
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("labor_entries")
    .select("id")
    .eq("project_id", body.erpProjectId)
    .eq("notes", externalKey)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true, id: existing.id });
  }

  const { data, error } = await supabase
    .from("labor_entries")
    .insert({
      project_id: body.erpProjectId,
      worker_name: "Huly worklog",
      user_id: body.erpUserId ?? null,
      work_category: "project_management",
      task_description: task,
      work_date: workDate,
      estimated_hours: 0,
      actual_hours: hours,
      regular_hours: hours,
      overtime_hours: 0,
      hourly_rate: 0,
      total_cost: 0,
      approval_status: "pending",
      notes: externalKey,
      created_by: body.erpUserId ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Failed to create labor entry" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    id: data.id,
    approval_status: "pending",
  });
}
