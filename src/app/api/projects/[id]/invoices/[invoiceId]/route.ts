import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  canEditBilling,
  canViewFinancials,
  getCurrentProfile,
} from "@/lib/auth";
import { canAccessProject } from "@/lib/project-access";
import { captureProjectFinancialSnapshot } from "@/lib/projects/snapshots";
import type { InvoiceStatus } from "@/lib/types";

function invoiceStatusFromPaid(total: number, paid: number): InvoiceStatus {
  if (paid <= 0) return "sent";
  if (paid + 0.001 >= total) return "paid";
  return "partially_paid";
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; invoiceId: string }> },
) {
  const { id: projectId, invoiceId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessProject(profile.id, profile.role, projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!canEditBilling(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("project_invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  let becameSent = false;

  if ("status" in body) {
    const status = String(body.status) as InvoiceStatus;
    const allowed: InvoiceStatus[] = [
      "draft",
      "sent",
      "partially_paid",
      "paid",
      "void",
    ];
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    patch.status = status;
    if (status === "sent" && existing.status === "draft") {
      patch.sent_at = new Date().toISOString();
      becameSent = true;
    }
  }
  for (const key of ["invoice_date", "due_date", "notes"] as const) {
    if (key in body) patch[key] = body[key] ? String(body[key]) : null;
  }
  if ("tax" in body) {
    const tax = Number(body.tax ?? 0) || 0;
    const subtotal = Number(existing.subtotal || 0);
    patch.tax = tax;
    patch.total = Math.round((subtotal + tax) * 100) / 100;
  }

  const { data, error } = await supabase
    .from("project_invoices")
    .update(patch)
    .eq("id", invoiceId)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (becameSent) {
    try {
      await captureProjectFinancialSnapshot(supabase, projectId, "invoice_sent");
    } catch {
      // non-fatal
    }
  }

  return NextResponse.json({ invoice: data });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; invoiceId: string }> },
) {
  const { id: projectId, invoiceId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewFinancials(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: lines } = await supabase
    .from("project_invoice_lines")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("sort_order");
  return NextResponse.json({ invoice: { ...data, lines: lines ?? [] } });
}

export { invoiceStatusFromPaid };
