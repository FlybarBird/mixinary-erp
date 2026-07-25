/** Sum invoice totals that count as billed (sent / partially paid / paid). */
export function sumBilledInvoices(
  invoices: Array<{ status?: string | null; total?: number | null }>,
) {
  let total = 0;
  for (const inv of invoices) {
    if (!inv) continue;
    if (!["sent", "partially_paid", "paid"].includes(String(inv.status || ""))) {
      continue;
    }
    total += Number(inv.total || 0);
  }
  return Math.round(total * 100) / 100;
}
