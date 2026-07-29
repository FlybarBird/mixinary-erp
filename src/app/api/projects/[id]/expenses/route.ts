import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canEditExpenses, canViewExpenses } from "@/lib/auth";
import { redactExpenseMoney } from "@/lib/money-redaction";
import { requireProjectApiContext } from "@/lib/project-guard";
import { newId } from "@/lib/local/db";
import { writeAuditEvent } from "@/lib/projects/workspace";
import { rebuildProjectCostLedger } from "@/lib/projects/cost-ledger";
import type { ExpenseCategory } from "@/lib/types";

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const ctx = await requireProjectApiContext(projectId);
  if (ctx instanceof NextResponse) return ctx;
  if (!canViewExpenses(ctx.profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_expenses")
    .select("*")
    .eq("project_id", projectId)
    .order("expense_date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const expenses = (data ?? []).map((expense) =>
    ctx.canViewMoney ? expense : redactExpenseMoney(expense),
  );
  return NextResponse.json({ expenses });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const ctx = await requireProjectApiContext(projectId);
  if (ctx instanceof NextResponse) return ctx;
  const profile = ctx.profile;
  if (!ctx.canEdit(canEditExpenses)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const category = body.category as ExpenseCategory;
  if (!VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  const supabase = await createClient();

  const expense = {
    id: newId(),
    project_id: projectId,
    expense_date: String(body.expense_date ?? new Date().toISOString().slice(0, 10)),
    category,
    payee: (body.payee as string | null) ?? null,
    description: String(body.description ?? ""),
    amount: Number(body.amount ?? 0),
    tax: Number(body.tax ?? 0),
    cost_code: (body.cost_code as string | null) ?? null,
    submitted_by: profile.id,
    approval_status: "pending" as const,
    payment_status: "unpaid" as const,
    is_additional_charge: Boolean(body.is_additional_charge ?? false),
    is_billable: Boolean(body.is_billable ?? false),
    change_order_id: (body.change_order_id as string | null) || null,
    receipt_path: (body.receipt_path as string | null) ?? null,
    notes: (body.notes as string | null) ?? null,
  };

  const { data, error } = await supabase
    .from("project_expenses")
    .insert(expense)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAuditEvent(supabase, {
    projectId,
    entityType: "project_expense",
    entityId: expense.id,
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
    { expense: ctx.canViewMoney ? data : redactExpenseMoney(data) },
    { status: 201 },
  );
}
