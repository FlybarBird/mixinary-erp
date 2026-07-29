import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canApproveLabor, canEditLabor } from "@/lib/auth";
import { redactLaborEntryMoney } from "@/lib/money-redaction";
import { requireProjectApiContext } from "@/lib/project-guard";
import { newId } from "@/lib/local/db";
import { writeAuditEvent } from "@/lib/projects/workspace";
import { rebuildProjectCostLedger } from "@/lib/projects/cost-ledger";
import {
  laborLinePricing,
  laborMsrp,
  laborQty,
} from "@/lib/projects/labor-export";
import type { ApprovalStatus } from "@/lib/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const ctx = await requireProjectApiContext(projectId);
  if (ctx instanceof NextResponse) return ctx;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("labor_entries")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("work_date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const entries = (data ?? []).map((entry) =>
    ctx.canViewMoney ? entry : redactLaborEntryMoney(entry),
  );
  return NextResponse.json({ entries });
}

/** Legacy single-create — kept for compatibility. Prefer PUT batch. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const ctx = await requireProjectApiContext(projectId);
  if (ctx instanceof NextResponse) return ctx;
  const profile = ctx.profile;
  if (!ctx.canEdit(canEditLabor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const supabase = await createClient();
  const canRates = ctx.canViewMoney;

  const { data: project } = await supabase
    .from("projects")
    .select("default_override_pct")
    .eq("id", projectId)
    .maybeSingle();
  const defaultOverride = Number(project?.default_override_pct ?? 0);

  const qty = laborQty({ qty: body.qty });
  const msrp = canRates
    ? Number(body.msrp ?? body.hourly_rate ?? 0) || 0
    : 0;
  const quote =
    canRates && body.quote !== undefined && body.quote !== null && body.quote !== ""
      ? Number(body.quote)
      : null;
  const override_pct =
    canRates &&
    body.override_pct !== undefined &&
    body.override_pct !== null &&
    body.override_pct !== ""
      ? Number(body.override_pct)
      : null;
  const pricing = laborLinePricing(
    { qty, msrp, quote, override_pct, hourly_rate: msrp },
    defaultOverride,
  );

  const { data: maxRow } = await supabase
    .from("labor_entries")
    .select("sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const entry = {
    id: newId(),
    project_id: projectId,
    worker_name: String(body.worker_name ?? ""),
    user_id: (body.user_id as string | null) ?? null,
    work_category: (body.work_category as string | null) ?? null,
    task_description: (body.task_description as string | null) ?? null,
    work_date: String(body.work_date ?? "") || "",
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
    burden_pct: canRates ? Number(body.burden_pct ?? 0) || 0 : 0,
    billing_rate: pricing.unitSale,
    total_cost: pricing.totalQuote,
    approval_status: "pending" as const,
    notes: (body.notes as string | null) ?? null,
    sort_order: Number(maxRow?.sort_order ?? -1) + 1,
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

  try {
    await rebuildProjectCostLedger(supabase, projectId);
  } catch {
    // non-fatal
  }

  return NextResponse.json(
    { entry: canRates ? data : redactLaborEntryMoney(data) },
    { status: 201 },
  );
}

/**
 * Batch save labor priced lines (BOM-style).
 * Upserts payload lines in order, deletes project lines missing from payload.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const ctx = await requireProjectApiContext(projectId);
  if (ctx instanceof NextResponse) return ctx;
  const profile = ctx.profile;
  if (!ctx.canEdit(canEditLabor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const lines = (body.lines ?? []) as Array<Record<string, unknown>>;
  const canRates = ctx.canViewMoney;
  const canApprove = ctx.canEdit(canApproveLabor);

  const supabase = await createClient();
  const [{ data: existing }, { data: project }] = await Promise.all([
    supabase.from("labor_entries").select("*").eq("project_id", projectId),
    supabase
      .from("projects")
      .select("default_override_pct")
      .eq("id", projectId)
      .maybeSingle(),
  ]);
  const defaultOverride = Number(project?.default_override_pct ?? 0);

  const existingById = new Map(
    (existing ?? []).map((e) => [String(e.id), e]),
  );
  const keptIds = new Set<string>();
  const saved: unknown[] = [];

  for (const [index, line] of lines.entries()) {
    const rawId = String(line.id ?? "");
    const isNew = !rawId || rawId.startsWith("new-");
    const prev = !isNew ? existingById.get(rawId) : null;

    let qty = laborQty({ qty: prev?.qty });
    let msrp = laborMsrp(prev);
    let quote =
      prev?.quote != null && prev.quote !== undefined
        ? Number(prev.quote)
        : null;
    let override_pct =
      prev?.override_pct != null && prev.override_pct !== undefined
        ? Number(prev.override_pct)
        : null;
    let burden_pct = Number(prev?.burden_pct ?? 0);

    if (line.qty !== undefined) qty = laborQty({ qty: Number(line.qty) });
    if (canRates) {
      if (line.msrp !== undefined) msrp = Number(line.msrp) || 0;
      if (line.quote !== undefined) {
        quote =
          line.quote === null || line.quote === ""
            ? null
            : Number(line.quote);
      }
      if (line.override_pct !== undefined) {
        override_pct =
          line.override_pct === null || line.override_pct === ""
            ? null
            : Number(line.override_pct);
      }
      if (line.burden_pct !== undefined) {
        burden_pct = Number(line.burden_pct) || 0;
      }
    }

    const pricing = laborLinePricing(
      { qty, msrp, quote, override_pct, hourly_rate: msrp },
      defaultOverride,
    );

    let approval_status = String(
      prev?.approval_status ?? "pending",
    ) as ApprovalStatus;
    if (line.approval_status !== undefined) {
      if (!canApprove) {
        return NextResponse.json(
          { error: "Cannot change approval without approval permission" },
          { status: 403 },
        );
      }
      approval_status = String(line.approval_status) as ApprovalStatus;
    }

    const payload = {
      project_id: projectId,
      worker_name: String(line.worker_name ?? prev?.worker_name ?? ""),
      work_category:
        line.work_category !== undefined
          ? ((line.work_category as string | null) ?? null)
          : ((prev?.work_category as string | null) ?? null),
      task_description:
        line.task_description !== undefined
          ? ((line.task_description as string | null) ?? null)
          : ((prev?.task_description as string | null) ?? null),
      work_date:
        line.work_date !== undefined
          ? String(line.work_date ?? "")
          : String(prev?.work_date ?? ""),
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
      burden_pct,
      billing_rate: pricing.unitSale,
      total_cost: pricing.totalQuote,
      approval_status,
      notes:
        line.notes !== undefined
          ? ((line.notes as string | null) ?? null)
          : ((prev?.notes as string | null) ?? null),
      sort_order: index,
      updated_at: new Date().toISOString(),
    };

    if (!String(payload.task_description || "").trim() && !payload.worker_name) {
      return NextResponse.json(
        { error: `Line ${index + 1}: description is required` },
        { status: 400 },
      );
    }

    if (isNew) {
      const id = newId();
      const { data, error } = await supabase
        .from("labor_entries")
        .insert({
          id,
          ...payload,
          created_by: profile.id,
        })
        .select()
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      keptIds.add(id);
      saved.push(data);
    } else {
      keptIds.add(rawId);
      const { data, error } = await supabase
        .from("labor_entries")
        .update(payload)
        .eq("id", rawId)
        .eq("project_id", projectId)
        .select()
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      saved.push(data);
    }
  }

  const toDelete = (existing ?? []).filter((e) => !keptIds.has(String(e.id)));
  if (toDelete.length) {
    const { error } = await supabase
      .from("labor_entries")
      .delete()
      .eq("project_id", projectId)
      .in(
        "id",
        toDelete.map((e) => e.id),
      );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  await writeAuditEvent(supabase, {
    projectId,
    entityType: "labor_entries",
    entityId: projectId,
    action: "labor_batch_save",
    before: { count: existing?.length ?? 0 },
    after: { count: saved.length, deleted: toDelete.length },
    actorId: profile.id,
  });

  try {
    await rebuildProjectCostLedger(supabase, projectId);
  } catch {
    // non-fatal
  }

  return NextResponse.json({
    entries: canRates
      ? saved
      : saved.map((entry) =>
          redactLaborEntryMoney(entry as Record<string, unknown>),
        ),
    ok: true,
  });
}
