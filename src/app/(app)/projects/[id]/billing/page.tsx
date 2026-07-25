import { notFound } from "next/navigation";
import { BillingView } from "@/components/BillingView";
import {
  canEditBilling,
  canManageApAndSubs,
  canViewFinancials,
  requireProfile,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ProjectInvoice, ProjectPayment, VendorBill } from "@/lib/types";

export default async function BillingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  if (!canViewFinancials(profile.role)) {
    return (
      <div className="panel" style={{ padding: "1.25rem" }}>
        <strong>Billing</strong>
        <p style={{ color: "var(--muted)", marginTop: "0.5rem" }}>
          You do not have permission to view project financials.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  const [
    { data: invoices },
    { data: payments },
    { data: vendorBills },
    { data: pos },
    { data: vendors },
  ] = await Promise.all([
    supabase
      .from("project_invoices")
      .select("*")
      .eq("project_id", id)
      .order("invoice_date", { ascending: false }),
    supabase
      .from("project_payments")
      .select("*")
      .eq("project_id", id)
      .order("payment_date", { ascending: false }),
    supabase
      .from("vendor_bills")
      .select("*")
      .eq("project_id", id)
      .order("bill_date", { ascending: false }),
    supabase
      .from("purchase_orders")
      .select("id, po_number, vendor_id, total")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("vendors").select("id, name").order("name"),
  ]);

  const invIds = (invoices ?? []).map((i) => i.id);
  const linesByInv = new Map<string, Array<Record<string, unknown>>>();
  if (invIds.length) {
    const { data: lines } = await supabase
      .from("project_invoice_lines")
      .select("*")
      .in("invoice_id", invIds);
    for (const line of lines ?? []) {
      const list = linesByInv.get(line.invoice_id) ?? [];
      list.push(line);
      linesByInv.set(line.invoice_id, list);
    }
  }

  return (
    <BillingView
      projectId={id}
      initialInvoices={(invoices ?? []).map((inv) => ({
        ...inv,
        lines: linesByInv.get(inv.id) ?? [],
      })) as ProjectInvoice[]}
      initialPayments={(payments ?? []) as ProjectPayment[]}
      initialVendorBills={(vendorBills ?? []) as VendorBill[]}
      purchaseOrders={pos ?? []}
      vendors={vendors ?? []}
      canEdit={canEditBilling(profile.role)}
      canManageAp={canManageApAndSubs(profile.role)}
    />
  );
}
