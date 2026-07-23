import { notFound } from "next/navigation";
import { ExpensesView } from "@/components/ExpensesView";
import { canEditExpenses, canApproveExpenses, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ProjectExpense } from "@/lib/types";

export default async function ExpensesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (!project) notFound();

  const { data: expenses } = await supabase
    .from("project_expenses")
    .select("*")
    .eq("project_id", id)
    .order("expense_date", { ascending: false });

  return (
    <ExpensesView
      projectId={id}
      initialExpenses={(expenses ?? []) as ProjectExpense[]}
      canEdit={canEditExpenses(profile.role)}
      canApprove={canApproveExpenses(profile.role)}
    />
  );
}
