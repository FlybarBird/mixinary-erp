import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  canEditBilling,
  canViewFinancials,
  getCurrentProfile,
} from "@/lib/auth";
import { newId } from "@/lib/local/db";
import { canAccessProject } from "@/lib/project-access";
import { captureProjectFinancialSnapshot } from "@/lib/projects/snapshots";

async function nextInvoiceNumber(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
) {
  const { data } = await supabase
    .from("project_invoices")
    .select("invoice_number")
    .eq("project_id", projectId);
  let max = 0;
  for (const row of data ?? []) {
    const m = String(row.invoice_number || "").match(/(\d+)\s*$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `INV-${String(max + 1).padStart(3, "0")}`;
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
  const [{ data: invoices, error }, { data: payments }] = await Promise.all([
    supabase
      .from("project_invoices")
      .select("*")
      .eq("project_id", projectId)
      .order("invoice_date", { ascending: false }),
    supabase
      .from("project_payments")
      .select("*, project_payment_applications(*)")
      .eq("project_id", projectId)
      .order("payment_date", { ascending: false }),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const invIds = (invoices ?? []).map((i) => i.id);
  let lines: Array<Record<string, unknown>> = [];
  if (invIds.length) {
    const { data } = await supabase
      .from("project_invoice_lines")
      .select("*")
      .in("invoice_id", invIds);
    lines = (data ?? []) as Array<Record<string, unknown>>;
  }
  const linesByInv = new Map<string, unknown[]>();
  for (const line of lines) {
    const invoiceId = String(line.invoice_id);
    const list = linesByInv.get(invoiceId) ?? [];
    list.push(line);
    linesByInv.set(invoiceId, list);
  }

  return NextResponse.json({
    invoices: (invoices ?? []).map((inv) => ({
      ...inv,
      lines: linesByInv.get(inv.id) ?? [],
    })),
    payments: payments ?? [],
  });
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
  const supabase = await createClient();
  const invoiceNumber =
    String(body.invoice_number || "").trim() ||
    (await nextInvoiceNumber(supabase, projectId));

  type BuiltLine = {
    id: string;
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
    change_order_id: string | null;
    category: string | null;
    sort_order: number;
  };
  const lineInputs = Array.isArray(body.lines) ? body.lines : [];
  const builtLines: BuiltLine[] = lineInputs.map(
    (
      line: {
        description?: string;
        quantity?: number;
        unit_price?: number;
        change_order_id?: string | null;
        category?: string | null;
      },
      idx: number,
    ) => {
      const quantity = Number(line.quantity ?? 1) || 0;
      const unit_price = Number(line.unit_price ?? 0) || 0;
      return {
        id: newId(),
        description: String(line.description || "Line"),
        quantity,
        unit_price,
        amount: Math.round(quantity * unit_price * 100) / 100,
        change_order_id: line.change_order_id || null,
        category: line.category || null,
        sort_order: idx,
      };
    },
  );
  const subtotal =
    builtLines.reduce((s: number, l: BuiltLine) => s + l.amount, 0) ||
    Number(body.subtotal ?? 0) ||
    0;
  const tax = Number(body.tax ?? 0) || 0;
  const total = Math.round((subtotal + tax) * 100) / 100;
  const status = body.status === "sent" ? "sent" : "draft";
  const now = new Date().toISOString();

  const invoice = {
    id: newId(),
    project_id: projectId,
    invoice_number: invoiceNumber,
    status,
    invoice_date: String(
      body.invoice_date || new Date().toISOString().slice(0, 10),
    ),
    due_date: body.due_date ? String(body.due_date) : null,
    subtotal,
    tax,
    total,
    amount_paid: 0,
    notes: body.notes ? String(body.notes) : null,
    sent_at: status === "sent" ? now : null,
    created_by: profile.id,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("project_invoices")
    .insert(invoice)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (builtLines.length) {
    const { error: lineErr } = await supabase.from("project_invoice_lines").insert(
      builtLines.map((l: BuiltLine) => ({ ...l, invoice_id: data.id })),
    );
    if (lineErr) {
      return NextResponse.json({ error: lineErr.message }, { status: 400 });
    }
  }

  if (status === "sent") {
    try {
      await captureProjectFinancialSnapshot(supabase, projectId, "invoice_sent");
    } catch {
      // non-fatal
    }
  }

  return NextResponse.json({
    invoice: { ...data, lines: builtLines },
  });
}
