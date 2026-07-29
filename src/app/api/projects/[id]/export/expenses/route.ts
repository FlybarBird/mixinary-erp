import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canViewExpenses } from "@/lib/auth";
import { requireProjectApiContext } from "@/lib/project-guard";

function esc(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(cols: unknown[]): string {
  return cols.map(esc).join(",");
}

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
  const canMoney = ctx.canViewMoney;

  const supabase = await createClient();
  const { data: expenses } = await supabase
    .from("project_expenses")
    .select("*")
    .eq("project_id", projectId)
    .order("expense_date");

  const headers = [
    "Date",
    "Category",
    "Payee",
    "Description",
    ...(canMoney ? ["Amount", "Tax"] : []),
    "Cost Code",
    "Approval Status",
    "Payment Status",
    "Additional Charge",
    "Notes",
  ];

  const rows = (expenses ?? []).map((e) => [
    e.expense_date,
    e.category,
    e.payee ?? "",
    e.description,
    ...(canMoney ? [e.amount, e.tax] : []),
    e.cost_code ?? "",
    e.approval_status,
    e.payment_status,
    e.is_additional_charge ? "Yes" : "No",
    e.notes ?? "",
  ]);

  const csv = [row(headers), ...rows.map(row)].join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="expenses-${projectId}.csv"`,
    },
  });
}
