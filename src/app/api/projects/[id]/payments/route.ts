import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canEditBilling, getCurrentProfile } from "@/lib/auth";
import { newId } from "@/lib/local/db";
import { canAccessProject } from "@/lib/project-access";
import { captureProjectFinancialSnapshot } from "@/lib/projects/snapshots";
import type { InvoiceStatus } from "@/lib/types";

function statusFromPaid(total: number, paid: number): InvoiceStatus {
  if (paid <= 0) return "sent";
  if (paid + 0.001 >= total) return "paid";
  return "partially_paid";
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
  if (!canEditBilling(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const amount = Number(body.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });
  }

  const applications: Array<{ invoice_id: string; amount: number }> = Array.isArray(
    body.applications,
  )
    ? body.applications.map(
        (a: { invoice_id?: string; amount?: number }) => ({
          invoice_id: String(a.invoice_id || ""),
          amount: Number(a.amount ?? 0) || 0,
        }),
      )
    : body.invoice_id
      ? [{ invoice_id: String(body.invoice_id), amount }]
      : [];

  const appliedSum = applications.reduce((s, a) => s + a.amount, 0);
  if (applications.length && Math.abs(appliedSum - amount) > 0.01) {
    return NextResponse.json(
      { error: "Applications must sum to payment amount" },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  // Validate open balances
  for (const app of applications) {
    if (!app.invoice_id || app.amount <= 0) {
      return NextResponse.json({ error: "Invalid application" }, { status: 400 });
    }
    const { data: inv } = await supabase
      .from("project_invoices")
      .select("id, total, amount_paid, status, project_id")
      .eq("id", app.invoice_id)
      .eq("project_id", projectId)
      .maybeSingle();
    if (!inv) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (inv.status === "draft" || inv.status === "void") {
      return NextResponse.json(
        { error: "Cannot apply payment to draft/void invoice" },
        { status: 400 },
      );
    }
    const open = Number(inv.total || 0) - Number(inv.amount_paid || 0);
    if (app.amount - open > 0.01) {
      return NextResponse.json(
        { error: `Application exceeds open balance on invoice` },
        { status: 400 },
      );
    }
  }

  const payment = {
    id: newId(),
    project_id: projectId,
    payment_date: String(
      body.payment_date || new Date().toISOString().slice(0, 10),
    ),
    amount,
    method: body.method ? String(body.method) : null,
    reference: body.reference ? String(body.reference) : null,
    notes: body.notes ? String(body.notes) : null,
    created_by: profile.id,
    created_at: new Date().toISOString(),
  };

  const { data: payRow, error } = await supabase
    .from("project_payments")
    .insert(payment)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  for (const app of applications) {
    const { error: appErr } = await supabase
      .from("project_payment_applications")
      .insert({
        id: newId(),
        payment_id: payRow.id,
        invoice_id: app.invoice_id,
        amount: app.amount,
      });
    if (appErr) {
      return NextResponse.json({ error: appErr.message }, { status: 400 });
    }

    const { data: inv } = await supabase
      .from("project_invoices")
      .select("total, amount_paid, status")
      .eq("id", app.invoice_id)
      .single();
    const paid = Number(inv?.amount_paid || 0) + app.amount;
    const total = Number(inv?.total || 0);
    const nextStatus =
      inv?.status === "void" ? "void" : statusFromPaid(total, paid);
    await supabase
      .from("project_invoices")
      .update({
        amount_paid: paid,
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", app.invoice_id);
  }

  try {
    await captureProjectFinancialSnapshot(supabase, projectId, "payment");
  } catch {
    // non-fatal
  }

  return NextResponse.json({ payment: payRow });
}
