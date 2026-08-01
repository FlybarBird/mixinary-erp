/** Shared QR / warehouse label models (Brother iPad + DYMO web). */

export type LabelMode = "receive" | "item";

export type LabelSourceItem = {
  id: string;
  description: string;
  sku: string | null;
  qty_ordered: number;
};

export type LabelPrintRow = {
  key: string;
  itemId: string;
  description: string;
  sku: string | null;
  qtyOrdered: number;
  pieceIndex: number | null;
  pieceTotal: number | null;
};

export const MAX_LABELS = 200;

/** Brother QL 62mm continuous — primary iPad stock (≈ 2.44″ × 1.81″ cut). */
export const BROTHER_LABEL = {
  /** Printable width for DK-2205 / RollW62 (mm). */
  widthMm: 62,
  /** Cut height matching prior 1.8″ warehouse label (mm). */
  heightMm: 46,
  /** SDK enum name used by Brother Print SDK wrappers. */
  qlLabelSize: "RollW62" as const,
  /** Recommended hardware for Mixinary warehouse iPads. */
  recommendedModels: ["QL-820NWB", "QL-1110NWB"] as const,
};

export function buildReceiveQrUrl(opts: {
  origin: string;
  projectId: string;
  itemId: string;
}): string {
  const origin = opts.origin.replace(/\/$/, "");
  return `${origin}/projects/${opts.projectId}/receive?item=${opts.itemId}`;
}

export function buildLabelPrintRows(
  items: LabelSourceItem[],
  mode: LabelMode,
  maxLabels = MAX_LABELS,
): { rows: LabelPrintRow[]; truncated: boolean } {
  const rows: LabelPrintRow[] = [];
  let truncated = false;

  for (const item of items) {
    if (mode === "receive") {
      if (rows.length >= maxLabels) {
        truncated = true;
        break;
      }
      rows.push({
        key: item.id,
        itemId: item.id,
        description: item.description,
        sku: item.sku,
        qtyOrdered: item.qty_ordered,
        pieceIndex: null,
        pieceTotal: null,
      });
      continue;
    }

    const total = Math.max(1, Math.floor(Number(item.qty_ordered) || 0));
    for (let i = 1; i <= total; i++) {
      if (rows.length >= maxLabels) {
        truncated = true;
        break;
      }
      rows.push({
        key: `${item.id}-${i}`,
        itemId: item.id,
        description: item.description,
        sku: item.sku,
        qtyOrdered: item.qty_ordered,
        pieceIndex: i,
        pieceTotal: total,
      });
    }
    if (truncated) break;
  }

  return { rows, truncated };
}
