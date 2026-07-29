import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  canManageAp,
  canViewFinancials,
} from "@/lib/auth";
import { requireProjectApiContext } from "@/lib/project-guard";
import { newId } from "@/lib/local/db";
import type { VendorBillStatus } from "@/lib/types";

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
  const { data, error } = await supabase
    .from("vendor_bills")
    .select("*, vendors(name), purchase_orders(po_number)")
    .eq("project_id", projectId)
    .order("bill_date", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ vendorBills: data ?? [] });
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
  if (!ctx.canEdit(canManageAp)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const amount = Number(body.amount ?? 0) || 0;
  const amountPaid = Number(body.amount_paid ?? 0) || 0;
  let status = (body.status as VendorBillStatus) || "accrued";
  if (amountPaid > 0 && amountPaid + 0.001 >= amount) status = "paid";
  else if (amountPaid > 0) status = "billed";
  else if (status === "paid") status = "billed";

  const supabase = await createClient();
  const row = {
    id: newId(),
    project_id: projectId,
    purchase_order_id: body.purchase_order_id || null,
    vendor_id: body.vendor_id || null,
    vendor_invoice_number: body.vendor_invoice_number
      ? String(body.vendor_invoice_number)
      : null,
    bill_date: body.bill_date ? String(body.bill_date) : null,
    due_date: body.due_date ? String(body.due_date) : null,
    amount,
    amount_paid: amountPaid,
    status,
    notes: body.notes ? String(body.notes) : null,
    created_by: profile.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("vendor_bills")
    .insert(row)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ vendorBill: data });
}
