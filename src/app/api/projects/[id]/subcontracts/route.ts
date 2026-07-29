import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  canEditSubcontracts,
  canViewFinancials,
} from "@/lib/auth";
import { requireProjectApiContext } from "@/lib/project-guard";
import { newId } from "@/lib/local/db";
import { rebuildProjectCostLedger } from "@/lib/projects/cost-ledger";
import type { SubcontractStatus } from "@/lib/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const ctx = await requireProjectApiContext(projectId);
  if (ctx instanceof NextResponse) return ctx;
  if (!canViewFinancials(ctx.profile.role) || !ctx.canViewMoney) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = await createClient();
  const [{ data: subs, error }, { data: bills }] = await Promise.all([
    supabase
      .from("project_subcontracts")
      .select("*, vendors(name)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("project_subcontract_bills")
      .select("*")
      .eq("project_id", projectId)
      .order("bill_date", { ascending: false }),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const bySub = new Map<string, unknown[]>();
  for (const b of bills ?? []) {
    const list = bySub.get(b.subcontract_id) ?? [];
    list.push(b);
    bySub.set(b.subcontract_id, list);
  }
  return NextResponse.json({
    subcontracts: (subs ?? []).map((s) => ({
      ...s,
      bills: bySub.get(s.id) ?? [],
    })),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const ctx = await requireProjectApiContext(projectId);
  if (ctx instanceof NextResponse) return ctx;
  const profile = ctx.profile;
  if (!canViewFinancials(profile.role) || !ctx.canViewMoney) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!ctx.canEdit(canEditSubcontracts)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const description = String(body.description ?? "").trim();
  if (!description) {
    return NextResponse.json({ error: "Description required" }, { status: 400 });
  }
  const status = (body.status as SubcontractStatus) || "draft";
  const supabase = await createClient();
  const row = {
    id: newId(),
    project_id: projectId,
    vendor_id: body.vendor_id || null,
    sub_name: body.sub_name ? String(body.sub_name) : null,
    description,
    contract_amount: Number(body.contract_amount ?? 0) || 0,
    status: ["draft", "active", "complete", "cancelled"].includes(status)
      ? status
      : "draft",
    billed_to_date: Number(body.billed_to_date ?? 0) || 0,
    paid_to_date: Number(body.paid_to_date ?? 0) || 0,
    notes: body.notes ? String(body.notes) : null,
    created_by: profile.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("project_subcontracts")
    .insert(row)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  try {
    await rebuildProjectCostLedger(supabase, projectId);
  } catch {
    // non-fatal
  }
  return NextResponse.json({ subcontract: data });
}
