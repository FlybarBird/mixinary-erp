import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  canApproveChangeOrders,
  canViewFinancials,
  getCurrentProfile,
} from "@/lib/auth";
import { newId } from "@/lib/local/db";
import { canAccessProject } from "@/lib/project-access";
import { captureProjectFinancialSnapshot } from "@/lib/projects/snapshots";
import type { ChangeOrderStatus } from "@/lib/types";

async function nextCoNumber(supabase: Awaited<ReturnType<typeof createClient>>, projectId: string) {
  const { data } = await supabase
    .from("project_change_orders")
    .select("co_number")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  let max = 0;
  for (const row of data ?? []) {
    const m = String(row.co_number || "").match(/(\d+)\s*$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `CO-${String(max + 1).padStart(3, "0")}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessProject(profile.id, profile.role, projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!canViewFinancials(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_change_orders")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ changeOrders: data ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessProject(profile.id, profile.role, projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!canApproveChangeOrders(profile.role) && !canViewFinancials(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Editors who can view financials (PM/admin) can create drafts
  if (
    profile.role !== "administrator" &&
    profile.role !== "project_manager" &&
    profile.role !== "accounting"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const title = String(body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const coNumber =
    String(body.co_number || "").trim() ||
    (await nextCoNumber(supabase, projectId));

  const status = (body.status as ChangeOrderStatus) || "draft";
  const now = new Date().toISOString();
  const row = {
    id: newId(),
    project_id: projectId,
    co_number: coNumber,
    title,
    description: body.description ? String(body.description) : null,
    status: ["draft", "submitted"].includes(status) ? status : "draft",
    revenue_delta: Number(body.revenue_delta ?? 0) || 0,
    budget_material_delta: Number(body.budget_material_delta ?? 0) || 0,
    budget_labor_delta: Number(body.budget_labor_delta ?? 0) || 0,
    budget_expense_delta: Number(body.budget_expense_delta ?? 0) || 0,
    budget_subcontractor_delta: Number(body.budget_subcontractor_delta ?? 0) || 0,
    budget_overhead_delta: Number(body.budget_overhead_delta ?? 0) || 0,
    requested_by: profile.id,
    approved_by: null,
    approved_at: null,
    effective_date: body.effective_date ? String(body.effective_date) : null,
    customer_reference: body.customer_reference
      ? String(body.customer_reference)
      : null,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("project_change_orders")
    .insert(row)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ changeOrder: data });
}
