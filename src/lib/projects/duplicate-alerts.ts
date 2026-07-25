import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export type DuplicateAlert = {
  key: string;
  label: string;
  detail: string;
  severity: "watch" | "critical";
  href: string;
  dollarImpact?: number | null;
};

function moneyClose(a: number, b: number) {
  return Math.abs(a - b) <= 0.5 || (b > 0 && Math.abs(a - b) / b <= 0.02);
}

/** Read-only heuristics for Action Center (Phase 6D). */
export async function buildDuplicateCostAlerts(
  supabase: Client,
  projectId: string,
): Promise<DuplicateAlert[]> {
  const base = `/projects/${projectId}`;
  const alerts: DuplicateAlert[] = [];

  const [
    { data: expenses },
    { data: pos },
    { data: labor },
    { data: changeOrders },
    { data: subBills },
    { data: lineItems },
  ] = await Promise.all([
    supabase
      .from("project_expenses")
      .select("id, payee, amount, tax, expense_date, po_id, approval_status, description")
      .eq("project_id", projectId),
    supabase
      .from("purchase_orders")
      .select("id, shipping, tax, status, vendors(name)")
      .eq("project_id", projectId),
    supabase
      .from("labor_entries")
      .select("id, worker_name, work_date, actual_hours, approval_status")
      .eq("project_id", projectId),
    supabase
      .from("project_change_orders")
      .select("id, co_number, revenue_delta, status, approved_at, effective_date")
      .eq("project_id", projectId),
    supabase
      .from("project_subcontract_bills")
      .select("id, amount, bill_date, description")
      .eq("project_id", projectId),
    supabase
      .from("line_items")
      .select("id, description, category, quote, qty, estimated_unit_cost")
      .eq("project_id", projectId),
  ]);

  // 1) Expense linked to PO should not also be "free-standing" cost — flag if approved without skip path
  for (const exp of expenses ?? []) {
    if (exp.po_id && exp.approval_status === "approved") {
      // Informational: linked expenses are skipped in ledger; still surface for review
      alerts.push({
        key: `exp-po-${exp.id}`,
        label: "Expense linked to PO",
        detail: `${exp.description || "Expense"} is linked to a PO — confirm it is not double counted.`,
        severity: "watch",
        href: `${base}/expenses`,
      });
    }
  }

  // 2) Expense near-match to PO shipping/tax without po_id
  const activePos = (pos ?? []).filter(
    (p) => p.status !== "draft" && p.status !== "cancelled",
  );
  for (const exp of expenses ?? []) {
    if (exp.po_id) continue;
    if (exp.approval_status === "rejected") continue;
    const expAmt = Number(exp.amount || 0) + Number(exp.tax || 0);
    if (!expAmt) continue;
    for (const po of activePos) {
      const vendor =
        (po.vendors as { name?: string } | null)?.name?.toLowerCase() || "";
      const payee = String(exp.payee || "").toLowerCase();
      const ship = Number(po.shipping || 0);
      const tax = Number(po.tax || 0);
      const vendorMatch =
        vendor && payee && (payee.includes(vendor) || vendor.includes(payee));
      if (
        (moneyClose(expAmt, ship) || moneyClose(expAmt, tax)) &&
        (vendorMatch || !payee)
      ) {
        alerts.push({
          key: `exp-po-match-${exp.id}-${po.id}`,
          label: "Possible expense/PO overlap",
          detail: `${exp.description || "Expense"} (~$${expAmt.toFixed(2)}) looks like PO shipping/tax.`,
          severity: "critical",
          href: `${base}/expenses`,
        });
        break;
      }
    }
  }

  // 3) Duplicate labor: same worker/date/hours approved
  const laborMap = new Map<string, string[]>();
  for (const entry of labor ?? []) {
    if (entry.approval_status !== "approved") continue;
    const key = [
      String(entry.worker_name || "").toLowerCase().trim(),
      String(entry.work_date || "").slice(0, 10),
      Number(entry.actual_hours || 0).toFixed(2),
    ].join("|");
    const list = laborMap.get(key) ?? [];
    list.push(entry.id);
    laborMap.set(key, list);
  }
  for (const [key, ids] of laborMap) {
    if (ids.length < 2) continue;
    const [worker, date, hours] = key.split("|");
    alerts.push({
      key: `labor-dup-${ids[0]}`,
      label: "Possible duplicate labor",
      detail: `${worker || "Worker"} on ${date} with ${hours}h appears ${ids.length} times.`,
      severity: "critical",
      href: `${base}/labor`,
    });
  }

  // 4) Approved CO revenue overlapping manual addition same week — checked by caller via project fields
  // (handled in dashboard with project.revenue_additions)

  // 5) Subcontract bill + expense same amount/date
  for (const bill of subBills ?? []) {
    const billAmt = Number(bill.amount || 0);
    const billDate = String(bill.bill_date || "").slice(0, 10);
    if (!billAmt) continue;
    for (const exp of expenses ?? []) {
      if (exp.approval_status === "rejected") continue;
      const expAmt = Number(exp.amount || 0) + Number(exp.tax || 0);
      const expDate = String(exp.expense_date || "").slice(0, 10);
      if (moneyClose(expAmt, billAmt) && expDate === billDate) {
        alerts.push({
          key: `sub-exp-${bill.id}-${exp.id}`,
          label: "Subcontract bill vs expense",
          detail: `Sub bill and expense both $${billAmt.toFixed(2)} on ${billDate}.`,
          severity: "critical",
          href: `${base}/subcontracts`,
        });
      }
    }
  }

  // 6) BOM freight/shipping line vs PO shipping amount
  const freightLines = (lineItems ?? []).filter((li) => {
    const cat = String(li.category || "").toLowerCase();
    const desc = String(li.description || "").toLowerCase();
    return (
      cat.includes("freight") ||
      cat.includes("ship") ||
      desc.includes("freight") ||
      desc.includes("shipping") ||
      desc.includes("delivery")
    );
  });
  for (const line of freightLines) {
    const lineAmt =
      Number(liQuote(line)) * Math.max(1, Number(line.qty || 1));
    if (lineAmt <= 0) continue;
    for (const po of activePos) {
      const ship = Number(po.shipping || 0);
      if (ship > 0 && moneyClose(lineAmt, ship)) {
        alerts.push({
          key: `bom-ship-${line.id}-${po.id}`,
          label: "BOM freight vs PO shipping",
          detail: `${line.description || "Freight line"} (~$${lineAmt.toFixed(2)}) matches PO shipping $${ship.toFixed(2)} — confirm not double counted.`,
          severity: "critical",
          href: `${base}/procurement`,
          dollarImpact: ship,
        });
        break;
      }
    }
  }

  // Cap noise
  return alerts.slice(0, 25);
}

function liQuote(line: {
  quote?: number | null;
  estimated_unit_cost?: number | null;
}) {
  if (line.quote != null && Number(line.quote) > 0) return Number(line.quote);
  return Number(line.estimated_unit_cost || 0);
}
