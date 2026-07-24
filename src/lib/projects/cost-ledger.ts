import { newId } from "@/lib/local/db";
import { calculateLinePricing } from "@/lib/pricing";
import { allocatePoOverhead } from "@/lib/projects/procurement";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

const INACTIVE_PO = new Set(["draft", "cancelled"]);

type LedgerInsert = {
  id: string;
  project_id: string;
  category: string;
  source_type: string;
  source_id: string;
  vendor_or_person: string | null;
  description: string | null;
  budget_amount: number;
  committed_amount: number;
  actual_amount: number;
  forecast_amount: number;
  transaction_date: string | null;
  approval_status: string | null;
  payment_status: string | null;
  billable: boolean;
  updated_at: string;
};

function money(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function mapExpenseCategory(raw: string | null | undefined): string {
  const c = String(raw || "other").toLowerCase();
  if (c.includes("freight") || c.includes("ship")) return "freight";
  if (c.includes("travel") || c.includes("lodging") || c.includes("meal") || c.includes("mileage"))
    return "travel";
  if (c.includes("equip") || c.includes("rental") || c.includes("tool")) return "equipment";
  if (c.includes("permit")) return "permits";
  if (c.includes("sub") || c.includes("contract")) return "subcontractors";
  if (c.includes("overhead")) return "overhead";
  if (c.includes("labor")) return "labor";
  if (c.includes("material")) return "materials";
  return "other";
}

/**
 * Idempotent full rebuild of project_cost_ledger from PO / labor / expenses / BOM.
 */
export async function rebuildProjectCostLedger(
  supabase: Client,
  projectId: string,
) {
  const now = new Date().toISOString();

  await supabase.from("project_cost_ledger").delete().eq("project_id", projectId);

  const [
    { data: project },
    { data: pos },
    { data: labor },
    { data: expenses },
    { data: lines },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id, default_override_pct")
      .eq("id", projectId)
      .maybeSingle(),
    supabase
      .from("purchase_orders")
      .select("id, status, shipping, tax, vendor_id, vendors(name)")
      .eq("project_id", projectId),
    supabase
      .from("labor_entries")
      .select(
        "id, worker_name, estimated_hours, actual_hours, hourly_rate, total_cost, approval_status, work_date",
      )
      .eq("project_id", projectId),
    supabase
      .from("project_expenses")
      .select(
        "id, category, payee, description, amount, tax, approval_status, payment_status, expense_date, po_id",
      )
      .eq("project_id", projectId),
    supabase
      .from("line_items")
      .select(
        "id, description, qty, qty_ordered, msrp, quote, override_pct, estimated_unit_cost",
      )
      .eq("project_id", projectId),
  ]);

  if (!project) return { count: 0 };

  const rows: LedgerInsert[] = [];
  const push = (row: Omit<LedgerInsert, "id" | "project_id" | "updated_at">) => {
    rows.push({
      id: newId(),
      project_id: projectId,
      updated_at: now,
      ...row,
    });
  };

  const poIds = (pos ?? []).map((p) => p.id);
  let poItems: Array<{
    id: string;
    po_id: string;
    description: string;
    qty_ordered: number;
    qty_received: number;
    unit_price: number;
    line_total: number;
    item_status: string;
    line_item_id: string | null;
  }> = [];

  if (poIds.length) {
    const { data } = await supabase
      .from("purchase_order_items")
      .select(
        "id, po_id, description, qty_ordered, qty_received, unit_price, line_total, item_status, line_item_id",
      )
      .in("po_id", poIds);
    poItems = (data ?? []) as typeof poItems;
  }

  const itemsByPo = new Map<string, typeof poItems>();
  for (const item of poItems) {
    if (!itemsByPo.has(item.po_id)) itemsByPo.set(item.po_id, []);
    itemsByPo.get(item.po_id)!.push(item);
  }

  for (const po of pos ?? []) {
    const status = String(po.status || "");
    if (INACTIVE_PO.has(status)) continue;

    const items = (itemsByPo.get(po.id) ?? []).filter(
      (i) => i.item_status !== "cancelled",
    );
    if (!items.length) continue;

    const vendorName =
      (po.vendors as { name?: string } | null)?.name ?? null;
    const lineTotals = items.map((i) => Number(i.line_total || 0));
    const alloc = allocatePoOverhead(
      lineTotals,
      Number(po.shipping || 0),
      Number(po.tax || 0),
    );

    let shippingCommitted = 0;
    let shippingActual = 0;
    let taxCommitted = 0;
    let taxActual = 0;

    items.forEach((item, idx) => {
      const qtyOrd = Number(item.qty_ordered || 0);
      const qtyRcv = Math.min(Number(item.qty_received || 0), qtyOrd);
      const unit = Number(item.unit_price || 0);
      const unreceived = Math.max(0, qtyOrd - qtyRcv);
      const committed = money(unreceived * unit);
      const actual = money(qtyRcv * unit);
      const ship = alloc[idx]?.allocated_shipping ?? 0;
      const tax = alloc[idx]?.allocated_tax ?? 0;
      const recvShare = qtyOrd > 0 ? qtyRcv / qtyOrd : 0;
      shippingActual += ship * recvShare;
      shippingCommitted += ship * (1 - recvShare);
      taxActual += tax * recvShare;
      taxCommitted += tax * (1 - recvShare);

      if (committed === 0 && actual === 0) return;
      push({
        category: "materials",
        source_type: "po_item",
        source_id: item.id,
        vendor_or_person: vendorName,
        description: item.description,
        budget_amount: 0,
        committed_amount: committed,
        actual_amount: actual,
        forecast_amount: 0,
        transaction_date: null,
        approval_status: status,
        payment_status: null,
        billable: false,
      });
    });

    if (shippingCommitted || shippingActual) {
      push({
        category: "freight",
        source_type: "po_shipping",
        source_id: po.id,
        vendor_or_person: vendorName,
        description: "PO shipping",
        budget_amount: 0,
        committed_amount: money(shippingCommitted),
        actual_amount: money(shippingActual),
        forecast_amount: 0,
        transaction_date: null,
        approval_status: status,
        payment_status: null,
        billable: false,
      });
    }

    if (taxCommitted || taxActual) {
      push({
        category: "other",
        source_type: "po_tax",
        source_id: po.id,
        vendor_or_person: vendorName,
        description: "PO tax",
        budget_amount: 0,
        committed_amount: money(taxCommitted),
        actual_amount: money(taxActual),
        forecast_amount: 0,
        transaction_date: null,
        approval_status: status,
        payment_status: null,
        billable: false,
      });
    }
  }

  for (const entry of labor ?? []) {
    const approved = entry.approval_status === "approved";
    const actual = approved ? money(Number(entry.total_cost || 0)) : 0;
    const estH = Number(entry.estimated_hours || 0);
    const actH = Number(entry.actual_hours || 0);
    const rate = Number(entry.hourly_rate || 0);
    const remainingH = Math.max(0, estH - actH);
    const forecast = money(remainingH * rate);

    if (!actual && !forecast) continue;
    push({
      category: "labor",
      source_type: "labor_entry",
      source_id: entry.id,
      vendor_or_person: entry.worker_name ?? null,
      description: entry.worker_name ?? "Labor",
      budget_amount: 0,
      committed_amount: 0,
      actual_amount: actual,
      forecast_amount: forecast,
      transaction_date: entry.work_date ?? null,
      approval_status: entry.approval_status ?? null,
      payment_status: null,
      billable: false,
    });
  }

  for (const exp of expenses ?? []) {
    if (exp.po_id) continue; // avoid double-count with PO
    const status = String(exp.approval_status || "");
    if (status === "rejected" || status === "draft") continue;
    const amount = money(Number(exp.amount || 0) + Number(exp.tax || 0));
    if (!amount) continue;
    const approved = status === "approved";
    push({
      category: mapExpenseCategory(exp.category as string),
      source_type: "expense",
      source_id: exp.id,
      vendor_or_person: (exp.payee as string) ?? null,
      description: (exp.description as string) ?? null,
      budget_amount: 0,
      committed_amount: 0,
      actual_amount: approved ? amount : 0,
      forecast_amount: 0,
      transaction_date: (exp.expense_date as string) ?? null,
      approval_status: status,
      payment_status: (exp.payment_status as string) ?? null,
      billable: false,
    });
  }

  // Forecast uncommitted: BOM qty not yet on active POs
  const defaultOverride = Number(project.default_override_pct || 0);
  for (const line of lines ?? []) {
    const qty = Number(line.qty || 0);
    const qtyOrdered = Number(line.qty_ordered || 0);
    const remaining = Math.max(0, qty - qtyOrdered);
    if (remaining <= 0) continue;

    const unitCost =
      line.estimated_unit_cost != null
        ? Number(line.estimated_unit_cost)
        : line.quote != null
          ? Number(line.quote)
          : Number(line.msrp || 0);
    // Prefer cost basis; fall back to quote pricing unit quote
    let unit = unitCost;
    if (!unit) {
      const pricing = calculateLinePricing({
        qty: 1,
        msrp: line.msrp,
        quote: line.quote,
        overridePct: line.override_pct,
        projectDefaultOverridePct: defaultOverride,
      });
      unit = pricing.unitQuote;
    }
    const forecast = money(remaining * unit);
    if (!forecast) continue;

    push({
      category: "materials",
      source_type: "bom_item",
      source_id: line.id,
      vendor_or_person: null,
      description: line.description ?? "Unordered BOM",
      budget_amount: 0,
      committed_amount: 0,
      actual_amount: 0,
      forecast_amount: forecast,
      transaction_date: null,
      approval_status: null,
      payment_status: null,
      billable: false,
    });
  }

  // Insert in batches
  const chunk = 50;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await supabase.from("project_cost_ledger").insert(slice);
    if (error) {
      throw new Error(`Cost ledger rebuild failed: ${error.message}`);
    }
  }

  await supabase
    .from("projects")
    .update({ financials_updated_at: now, updated_at: now })
    .eq("id", projectId);

  return { count: rows.length, financials_updated_at: now };
}

/** Rebuild if never built or forced. */
export async function ensureProjectCostLedger(
  supabase: Client,
  projectId: string,
  opts?: { force?: boolean },
) {
  if (!opts?.force) {
    const { data } = await supabase
      .from("projects")
      .select("financials_updated_at")
      .eq("id", projectId)
      .maybeSingle();
    if (data?.financials_updated_at) {
      const { data: rows } = await supabase
        .from("project_cost_ledger")
        .select("id")
        .eq("project_id", projectId)
        .limit(1);
      if (rows && rows.length > 0) return { rebuilt: false };
    }
  }
  await rebuildProjectCostLedger(supabase, projectId);
  return { rebuilt: true };
}
