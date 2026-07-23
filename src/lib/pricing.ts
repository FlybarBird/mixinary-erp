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

/** Always prefixes + or − (including for zero). */
export function formatSignedMoney(value: number | null | undefined): string {
  const amount = n(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "always",
  }).format(amount);
}

function mixChannel(from: number, to: number, t: number) {
  return Math.round(from + (to - from) * t);
}

function mixHex(from: string, to: string, t: number) {
  const parse = (hex: string) => ({
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  });
  const a = parse(from);
  const b = parse(to);
  const r = mixChannel(a.r, b.r, t);
  const g = mixChannel(a.g, b.g, t);
  const bl = mixChannel(a.b, b.b, t);
  return `#${[r, g, bl].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * OOP color vs item quote total:
 * - red when negative
 * - default grey at $0 OOP (sale = quote)
 * - brightens toward green as sale approaches 125% of quote total
 * - solid bright green at/above 125% of quote total (OOP >= 25% of quote)
 */
export function outOfPocketColor(
  outOfPocket: number | null | undefined,
  totalQuote: number | null | undefined,
): string {
  const oop = n(outOfPocket);
  const quote = n(totalQuote);
  if (oop < 0) return "#e53935";
  if (quote <= 0) return "#78909c";
  // 125% of quote total ⇒ sale = 1.25 * quote ⇒ oop = 0.25 * quote
  const greenAtOop = quote * 0.25;
  const progress = Math.min(1, Math.max(0, oop / greenAtOop));
  // Ease in so it stays greyer early, then brightens into green near 125%
  const t = progress * progress;
  return mixHex("#78909c", "#00c853", t);
}

export function outOfPocketStyle(
  outOfPocket: number | null | undefined,
  totalQuote: number | null | undefined,
): { color: string; fontWeight: number } {
  const oop = n(outOfPocket);
  const quote = n(totalQuote);
  const color = outOfPocketColor(oop, quote);
  const atGreen = quote > 0 && oop >= quote * 0.25;
  return {
    color,
    fontWeight: oop < 0 || atGreen ? 700 : 650,
  };
}

export function formatPct(value: number | null | undefined): string {
  return `${(n(value) * 100).toFixed(2)}%`;
}
