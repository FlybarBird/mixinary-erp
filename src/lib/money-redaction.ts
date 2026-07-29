/**
 * Server-side redaction of monetary fields for users without the
 * "View any money / $ value" permission on a project.
 *
 * Apply these before serializing rows into page props or API responses so a
 * denied user never receives monetary data (visible UI, hidden DOM,
 * serialized props, or API payloads). Non-null numeric columns are zeroed;
 * nullable ones are nulled.
 */

function redactFields<T extends object>(
  row: T,
  zeroFields: readonly string[],
  nullFields: readonly string[],
): T {
  const next: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const field of zeroFields) {
    if (field in next) next[field] = 0;
  }
  for (const field of nullFields) {
    if (field in next) next[field] = null;
  }
  return next as T;
}

/** BOM line items: msrp, quote, override %, estimated cost. */
export function redactLineItemMoney<T extends object>(row: T): T {
  return redactFields(
    row,
    ["msrp"],
    ["quote", "override_pct", "estimated_unit_cost"],
  );
}

/** Labor entries: rates, pricing, burden, totals. */
export function redactLaborEntryMoney<T extends object>(row: T): T {
  return redactFields(
    row,
    ["hourly_rate", "total_cost", "msrp", "burden_pct", "billing_rate"],
    ["quote", "override_pct"],
  );
}

/** Purchase orders: totals, profit, margin. */
export function redactPurchaseOrderMoney<T extends object>(row: T): T {
  return redactFields(
    row,
    ["subtotal", "tax", "shipping", "total", "sale_total", "profit"],
    ["margin_pct"],
  );
}

/** Purchase order items: prices, allocations, profit. */
export function redactPoItemMoney<T extends object>(row: T): T {
  return redactFields(
    row,
    [
      "unit_price",
      "line_total",
      "shipping",
      "sale_total",
      "allocated_shipping",
      "allocated_tax",
      "cost_total",
      "profit",
    ],
    ["margin_pct"],
  );
}

/** Project expenses: amount and tax. */
export function redactExpenseMoney<T extends object>(row: T): T {
  return redactFields(row, ["amount", "tax"], []);
}
