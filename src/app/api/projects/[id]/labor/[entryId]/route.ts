import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canEditLabor, canApproveLabor } from "@/lib/auth";
import { redactLaborEntryMoney } from "@/lib/money-redaction";
import { requireProjectApiContext } from "@/lib/project-guard";
import { writeAuditEvent } from "@/lib/projects/workspace";
import { rebuildProjectCostLedger } from "@/lib/projects/cost-ledger";
import {
  laborLinePricing,
  laborMsrp,
  laborQty,
} from "@/lib/projects/labor-export";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const { id: projectId, entryId } = await params;
  const ctx = await requireProjectApiContext(projectId);
  if (ctx instanceof NextResponse) return ctx;
  const profile = ctx.profile;
  if (!ctx.canEdit(canEditLabor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const canRates = ctx.canViewMoney;

  const supabase = await createClient();
  const [{ data: existing, error: fetchError }, { data: project }] =
    await Promise.all([
      supabase
        .from("labor_entries")
        .select("*")
        .eq("id", entryId)
        .eq("project_id", projectId)
        .maybeSingle(),
      supabase
        .from("projects")
        .select("default_override_pct")
        .eq("id", projectId)
        .maybeSingle(),
    ]);

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const defaultOverride = Number(project?.default_override_pct ?? 0);

  const qty =
    body.qty !== undefined
      ? laborQty({ qty: Number(body.qty) })
      : laborQty(existing);
  const msrp =
    canRates && body.msrp !== undefined
      ? Number(body.msrp) || 0
      : laborMsrp(existing);
  const quote =
    canRates && body.quote !== undefined
      ? body.quote === null || body.quote === ""
        ? null
        : Number(body.quote)
      : existing.quote != null
        ? Number(existing.quote)
        : null;
  const override_pct =
    canRates && body.override_pct !== undefined
      ? body.override_pct === null || body.override_pct === ""
        ? null
        : Number(body.override_pct)
      : existing.override_pct != null
        ? Number(existing.override_pct)
        : null;

  const pricing = laborLinePricing(
    { qty, msrp, quote, override_pct, hourly_rate: msrp },
    defaultOverride,
  );

  const updates: Record<string, unknown> = {
    worker_name:
      body.worker_name !== undefined
        ? String(body.worker_name)
        : existing.worker_name,
    work_category:
      body.work_category !== undefined
        ? (body.work_category as string | null)
        : existing.work_category,
    task_description:
      body.task_description !== undefined
        ? (body.task_description as string | null)
        : existing.task_description,
    work_date:
      body.work_date !== undefined
        ? String(body.work_date)
        : existing.work_date,
    estimated_hours: 0,
    actual_hours: 0,
    regular_hours: 0,
    overtime_hours: 0,
    hourly_rate: msrp,
    rate_type: "flat",
    qty,
    msrp,
    quote,
    override_pct,
    burden_pct:
      canRates && body.burden_pct !== undefined
        ? Number(body.burden_pct) || 0
        : Number(existing.burden_pct ?? 0) || 0,
    billing_rate: pricing.unitSale,
    total_cost: pricing.totalQuote,
    notes:
      body.notes !== undefined
        ? (body.notes as string | null)
        : existing.notes,
  };

  if (body.approval_status !== undefined) {
    if (!ctx.canEdit(canApproveLabor)) {
      return NextResponse.json(
        { error: "Cannot approve labor without approval permission" },
        { status: 403 },
      );
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

  try {
    await rebuildProjectCostLedger(supabase, projectId);
  } catch {
    // non-fatal
  }

  return NextResponse.json({
    entry: canRates ? data : redactLaborEntryMoney(data),
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const { id: projectId, entryId } = await params;
  const ctx = await requireProjectApiContext(projectId);
  if (ctx instanceof NextResponse) return ctx;
  const profile = ctx.profile;
  if (!ctx.canEdit(canEditLabor)) {
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

  try {
    await rebuildProjectCostLedger(supabase, projectId);
  } catch {
    // non-fatal
  }

  return NextResponse.json({ ok: true });
}
