/** Sum approved expense cost (amount + tax). Skips PO-linked rows to avoid double-count. */
export function sumApprovedExpenses(
  expenses: Array<{
    approval_status?: string | null;
    amount?: number | null;
    tax?: number | null;
    po_id?: string | null;
  }>,
) {
  let total = 0;
  for (const e of expenses) {
    if (!e) continue;
    if (e.po_id) continue;
    if (String(e.approval_status || "") !== "approved") continue;
    total += Number(e.amount || 0) + Number(e.tax || 0);
  }
  return Math.round(total * 100) / 100;
}
