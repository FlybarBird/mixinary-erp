import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canManageApAndSubs, getCurrentProfile } from "@/lib/auth";
import { newId } from "@/lib/local/db";
import { rebuildProjectCostLedger } from "@/lib/projects/cost-ledger";
import type { SubcontractStatus } from "@/lib/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; subId: string }> },
) {
  const { id: projectId, subId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageApAndSubs(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const supabase = await createClient();
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  for (const key of ["vendor_id", "sub_name", "description", "notes"] as const) {
    if (key in body) patch[key] = body[key] ? String(body[key]) : null;
  }
  if ("description" in body && !String(body.description || "").trim()) {
    return NextResponse.json({ error: "Description required" }, { status: 400 });
  }
  if ("description" in body) patch.description = String(body.description).trim();
  for (const key of ["contract_amount", "billed_to_date", "paid_to_date"] as const) {
    if (key in body) patch[key] = Number(body[key] ?? 0) || 0;
  }
  if ("status" in body) {
    const status = String(body.status) as SubcontractStatus;
    if (!["draft", "active", "complete", "cancelled"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    patch.status = status;
  }

  // Optional nested bill create
  if (body.add_bill) {
    const bill = body.add_bill as {
      bill_date?: string;
      description?: string;
      amount?: number;
      amount_paid?: number;
    };
    const amount = Number(bill.amount ?? 0) || 0;
    const amountPaid = Number(bill.amount_paid ?? 0) || 0;
    const { error: billErr } = await supabase
      .from("project_subcontract_bills")
      .insert({
        id: newId(),
        subcontract_id: subId,
        project_id: projectId,
        bill_date: String(
          bill.bill_date || new Date().toISOString().slice(0, 10),
        ),
        description: bill.description ? String(bill.description) : null,
        amount,
        amount_paid: amountPaid,
        status: amountPaid + 0.001 >= amount && amount > 0 ? "paid" : "billed",
        created_at: new Date().toISOString(),
      });
    if (billErr) {
      return NextResponse.json({ error: billErr.message }, { status: 400 });
    }
    const { data: bills } = await supabase
      .from("project_subcontract_bills")
      .select("amount, amount_paid")
      .eq("subcontract_id", subId);
    patch.billed_to_date = (bills ?? []).reduce(
      (s, b) => s + Number(b.amount || 0),
      0,
    );
    patch.paid_to_date = (bills ?? []).reduce(
      (s, b) => s + Number(b.amount_paid || 0),
      0,
    );
  }

  const { data, error } = await supabase
    .from("project_subcontracts")
    .update(patch)
    .eq("id", subId)
    .eq("project_id", projectId)
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; subId: string }> },
) {
  const { id: projectId, subId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageApAndSubs(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_subcontracts")
    .delete()
    .eq("id", subId)
    .eq("project_id", projectId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  try {
    await rebuildProjectCostLedger(supabase, projectId);
  } catch {
    // non-fatal
  }
  return NextResponse.json({ ok: true });
}
