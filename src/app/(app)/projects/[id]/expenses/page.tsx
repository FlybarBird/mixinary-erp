import { notFound } from "next/navigation";
import { ExpensesView } from "@/components/ExpensesView";
import {
  canApproveExpenses,
  canEditExpenses,
  canViewExpenses,
  requireProfile,
} from "@/lib/auth";
import { redactExpenseMoney } from "@/lib/money-redaction";
import {
  canEditProjectContent,
  getProjectMembership,
} from "@/lib/project-access";
import { createClient } from "@/lib/supabase/server";
import type { ProjectExpense } from "@/lib/types";

export default async function ExpensesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  if (!canViewExpenses(profile.role)) {
    return (
      <div className="panel" style={{ padding: "1.25rem" }}>
        <strong>Expenses</strong>
        <p style={{ color: "var(--muted)", marginTop: "0.5rem" }}>
          You do not have permission to view project expenses.
        </p>
      </div>
    );
  }

  const membership = await getProjectMembership(profile.id, profile.role, id);
  const canMoney = membership.canViewMoney;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (!project) notFound();

  const [{ data: expenses }, { data: changeOrders }] = await Promise.all([
    supabase
      .from("project_expenses")
      .select("*")
      .eq("project_id", id)
      .order("expense_date", { ascending: false }),
    supabase
      .from("project_change_orders")
      .select("id, co_number, title")
      .eq("project_id", id)
      .order("co_number"),
  ]);

  const safeExpenses = ((expenses ?? []) as ProjectExpense[]).map((expense) =>
    canMoney ? expense : redactExpenseMoney(expense),
  );

  return (
    <ExpensesView
      projectId={id}
      initialExpenses={safeExpenses}
      canEdit={canEditProjectContent(
        profile.role,
        membership.access,
        canEditExpenses(profile.role),
      )}
      canApprove={canEditProjectContent(
        profile.role,
        membership.access,
        canApproveExpenses(profile.role),
      )}
      canViewMoney={canMoney}
      changeOrders={changeOrders ?? []}
    />
  );
}
