import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canManageAp, canViewFinancials } from "@/lib/auth";
import { requireProjectApiContext } from "@/lib/project-guard";
import type { VendorBillStatus } from "@/lib/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; billId: string }> },
) {
  const { id: projectId, billId } = await params;
  const ctx = await requireProjectApiContext(projectId);
  if (ctx instanceof NextResponse) return ctx;
  if (!canViewFinancials(ctx.profile.role) || !ctx.canViewMoney) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!ctx.canEdit(canManageAp)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("vendor_bills")
    .select("*")
    .eq("id", billId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  for (const key of [
    "purchase_order_id",
    "vendor_id",
    "vendor_invoice_number",
    "bill_date",
    "due_date",
    "notes",
  ] as const) {
    if (key in body) patch[key] = body[key] ? String(body[key]) : null;
  }
  if ("amount" in body) patch.amount = Number(body.amount ?? 0) || 0;
  if ("amount_paid" in body) patch.amount_paid = Number(body.amount_paid ?? 0) || 0;
  if ("status" in body) {
    const status = String(body.status) as VendorBillStatus;
    if (!["accrued", "billed", "paid", "void"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    patch.status = status;
  } else if ("amount_paid" in body || "amount" in body) {
    const amount = Number(patch.amount ?? existing.amount ?? 0);
    const paid = Number(patch.amount_paid ?? existing.amount_paid ?? 0);
    if (paid <= 0) patch.status = existing.status === "accrued" ? "accrued" : "billed";
    else if (paid + 0.001 >= amount) patch.status = "paid";
    else patch.status = "billed";
  }

  const { data, error } = await supabase
    .from("vendor_bills")
    .update(patch)
    .eq("id", billId)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ vendorBill: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; billId: string }> },
) {
  const { id: projectId, billId } = await params;
  const ctx = await requireProjectApiContext(projectId);
  if (ctx instanceof NextResponse) return ctx;
  if (!canViewFinancials(ctx.profile.role) || !ctx.canViewMoney) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!ctx.canEdit(canManageAp)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("vendor_bills")
    .delete()
    .eq("id", billId)
    .eq("project_id", projectId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
