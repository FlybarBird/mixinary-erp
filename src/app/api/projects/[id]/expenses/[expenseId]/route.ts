import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canEditExpenses, canApproveExpenses, getCurrentProfile } from "@/lib/auth";
import { writeAuditEvent } from "@/lib/projects/workspace";
import { rebuildProjectCostLedger } from "@/lib/projects/cost-ledger";
import type { ExpenseCategory, ApprovalStatus, PaymentStatus } from "@/lib/types";

const VALID_CATEGORIES: ExpenseCategory[] = [
  "shipping_freight",
  "equipment_rental",
  "travel",
  "lodging",
  "meals",
  "permits",
  "subcontractors",
  "tools_supplies",
  "miscellaneous",
];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; expenseId: string }> },
) {
  const { id: projectId, expenseId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canEditExpenses(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("project_expenses")
    .select("*")
    .eq("id", expenseId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();

  const updates: Record<string, unknown> = {};

  if (body.expense_date !== undefined) updates.expense_date = String(body.expense_date);
  if (body.category !== undefined) {
    if (!VALID_CATEGORIES.includes(body.category as ExpenseCategory)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    updates.category = body.category;
  }
  if (body.payee !== undefined) updates.payee = body.payee as string | null;
  if (body.description !== undefined) updates.description = String(body.description);
  if (body.amount !== undefined) updates.amount = Number(body.amount);
  if (body.tax !== undefined) updates.tax = Number(body.tax);
  if (body.cost_code !== undefined) updates.cost_code = body.cost_code as string | null;
  if (body.is_additional_charge !== undefined) updates.is_additional_charge = Boolean(body.is_additional_charge);
  if (body.receipt_path !== undefined) updates.receipt_path = body.receipt_path as string | null;
  if (body.notes !== undefined) updates.notes = body.notes as string | null;

  if (body.approval_status !== undefined) {
    if (!canApproveExpenses(profile.role)) {
      return NextResponse.json({ error: "Cannot approve expenses without approval permission" }, { status: 403 });
    }
    updates.approval_status = body.approval_status as ApprovalStatus;
  }

  if (body.payment_status !== undefined) {
    if (!canApproveExpenses(profile.role)) {
      return NextResponse.json({ error: "Cannot update payment status without approval permission" }, { status: 403 });
    }
    updates.payment_status = body.payment_status as PaymentStatus;
  }

  const { data, error } = await supabase
    .from("project_expenses")
    .update(updates)
    .eq("id", expenseId)
    .eq("project_id", projectId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAuditEvent(supabase, {
    projectId,
    entityType: "project_expense",
    entityId: expenseId,
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

  return NextResponse.json({ expense: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; expenseId: string }> },
) {
  const { id: projectId, expenseId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canEditExpenses(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("project_expenses")
    .select("*")
    .eq("id", expenseId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("project_expenses")
    .delete()
    .eq("id", expenseId)
    .eq("project_id", projectId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAuditEvent(supabase, {
    projectId,
    entityType: "project_expense",
    entityId: expenseId,
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
