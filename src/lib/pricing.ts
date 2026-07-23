import type { LinePricing } from "./types";

function n(value: number | null | undefined): number {
  if (value == null || Number.isNaN(Number(value))) return 0;
  return Number(value);
}

/**
 * Sheet-equivalent pricing:
 * unit_quote = quote ?? msrp
 * override = line_override ?? project.default_override_pct
 * unit_sale = unit_quote + (msrp * override)
 * out_of_pocket = total_sale - total_quote
 */
export function calculateLinePricing(input: {
  qty: number | null | undefined;
  msrp: number | null | undefined;
  quote?: number | null;
  overridePct?: number | null;
  projectDefaultOverridePct?: number | null;
}): LinePricing {
  const qty = n(input.qty);
  const msrp = n(input.msrp);
  const unitQuote =
    input.quote == null || input.quote === undefined ? msrp : n(input.quote);
  const overridePct =
    input.overridePct == null || input.overridePct === undefined
      ? n(input.projectDefaultOverridePct)
      : n(input.overridePct);

  const totalMsrp = qty * msrp;
  const totalQuote = qty * unitQuote;
  const unitSale = unitQuote + msrp * overridePct;
  const totalSale = qty * unitSale;
  const clientSavings = totalMsrp - totalSale;
  const outOfPocket = totalSale - totalQuote;

  return {
    qty,
    msrp,
    unitQuote,
    totalMsrp,
    totalQuote,
    overridePct,
    unitSale,
    totalSale,
    clientSavings,
    outOfPocket,
  };
}

export function sumPricing(lines: LinePricing[]) {
  return lines.reduce(
    (acc, line) => ({
      totalMsrp: acc.totalMsrp + line.totalMsrp,
      totalQuote: acc.totalQuote + line.totalQuote,
      totalSale: acc.totalSale + line.totalSale,
      clientSavings: acc.clientSavings + line.clientSavings,
      outOfPocket: acc.outOfPocket + line.outOfPocket,
    }),
    {
      totalMsrp: 0,
      totalQuote: 0,
      totalSale: 0,
      clientSavings: 0,
      outOfPocket: 0,
    },
  );
}

export function formatMoney(value: number | null | undefined): string {
  const amount = n(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatPct(value: number | null | undefined): string {
  return `${(n(value) * 100).toFixed(2)}%`;
}
