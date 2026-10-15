/**
 * Client Documents block model — pure helpers shared by the staff editor,
 * the public customer renderer, API routes, and the PDF builder.
 *
 * Block content is stored as JSON on client_document_blocks.content and only
 * ever contains customer-facing data (never vendor cost, quote cost, burden,
 * margin, or procurement fields).
 */

export type ClientDocBlockType =
  | "cover"
  | "intro"
  | "customer_info"
  | "project_summary"
  | "text"
  | "image"
  | "scope"
  | "deliverables"
  | "pricing"
  | "quote_total"
  | "terms"
  | "acceptance"
  | "payment_instructions"
  | "contact";

export const CLIENT_DOC_BLOCK_TYPES: ClientDocBlockType[] = [
  "cover",
  "intro",
  "customer_info",
  "project_summary",
  "text",
  "image",
  "scope",
  "deliverables",
  "pricing",
  "quote_total",
  "terms",
  "acceptance",
  "payment_instructions",
  "contact",
];

export const CLIENT_DOC_BLOCK_LABELS: Record<ClientDocBlockType, string> = {
  cover: "Branded Cover",
  intro: "Title & Introduction",
  customer_info: "Customer Information",
  project_summary: "Project Summary",
  text: "Text",
  image: "Image",
  scope: "Scope of Work",
  deliverables: "Deliverables",
  pricing: "Pricing Table",
  quote_total: "Quote Total",
  terms: "Terms & Conditions",
  acceptance: "Acceptance & Signature",
  payment_instructions: "Payment Instructions",
  contact: "Contact Information",
};

/** Customer-facing pricing line. Prices are frozen sale prices at import. */
export interface PricingLine {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  qty: number;
  unit_price: number;
  /** Customer may include/exclude this line. Sub-items are never independently optional. */
  optional: boolean;
  /** Current selection (always true for required lines and sub-items). */
  selected: boolean;
  /** Customer may adjust quantity. */
  qty_editable: boolean;
  /** Parent line this sub-item follows. Null for top-level lines. */
  parent_id: string | null;
}

export interface PricingDiscount {
  type: "none" | "percent" | "amount";
  value: number;
}

export interface PricingTax {
  type: "none" | "percent" | "amount";
  value: number;
  label?: string;
}

export interface PricingBlockContent {
  title?: string;
  /** Customer may include or exclude this entire table. */
  optional: boolean;
  /** Whether an optional table is included (always true when the table is required). */
  selected: boolean;
  lines: PricingLine[];
  discount: PricingDiscount;
  tax: PricingTax;
  [key: string]: unknown;
}

export interface PricingLineGroup {
  line: PricingLine;
  children: PricingLine[];
}

export interface DocumentTotals {
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
}

export interface DocBlockSnapshot {
  id: string;
  block_type: ClientDocBlockType | string;
  sort_order: number;
  hidden: boolean;
  content: Record<string, unknown>;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function defaultBlockContent(
  type: ClientDocBlockType,
): Record<string, unknown> {
  switch (type) {
    case "cover":
      return { heading: "", subheading: "" };
    case "intro":
      return { title: "", body: "" };
    case "customer_info":
      return { note: "" };
    case "project_summary":
      return { body: "" };
    case "text":
      return { title: "", body: "" };
    case "image":
      return { url: "", caption: "" };
    case "scope":
      return { title: "Scope of Work", items: [] as string[] };
    case "deliverables":
      return { title: "Deliverables", items: [] as string[] };
    case "pricing":
      return {
        title: "Pricing",
        optional: false,
        selected: true,
        lines: [] as PricingLine[],
        discount: { type: "none", value: 0 },
        tax: { type: "none", value: 0, label: "Tax" },
      } satisfies PricingBlockContent;
    case "quote_total":
      return { label: "Quote", note: "" };
    case "terms":
      return { title: "Terms & Conditions", body: "" };
    case "acceptance":
      return {
        title: "Acceptance",
        statement:
          "By signing below, you accept this document and agree to its terms.",
      };
    case "payment_instructions":
      return { title: "Payment Instructions", body: "" };
    case "contact":
      return { title: "Questions?", body: "" };
    default:
      return {};
  }
}

export function normalizePricingContent(
  content: Record<string, unknown> | null | undefined,
): PricingBlockContent {
  const raw = (content ?? {}) as Partial<PricingBlockContent>;
  const lines = Array.isArray(raw.lines) ? raw.lines : [];
  const discount = raw.discount ?? { type: "none", value: 0 };
  const tax = raw.tax ?? { type: "none", value: 0 };
  const optional = Boolean(raw.optional);
  return {
    ...raw,
    title: typeof raw.title === "string" ? raw.title : "Pricing",
    optional,
    selected: optional ? raw.selected !== false : true,
    lines: clampPricingParents(
      lines.map((l) => {
        const line = l as Partial<PricingLine>;
        const lineOptional = Boolean(line.optional);
        const parentId =
          line.parent_id == null || line.parent_id === ""
            ? null
            : String(line.parent_id);
        return {
          id: String(line.id ?? ""),
          name: String(line.name ?? ""),
          description: line.description == null ? null : String(line.description),
          category: line.category == null ? null : String(line.category),
          qty: Math.max(0, num(line.qty)),
          unit_price: num(line.unit_price),
          optional: lineOptional,
          selected: lineOptional ? line.selected !== false : true,
          qty_editable: Boolean(line.qty_editable),
          parent_id: parentId,
        };
      }),
    ),
    discount: {
      type:
        discount.type === "percent" || discount.type === "amount"
          ? discount.type
          : "none",
      value: Math.max(0, num(discount.value)),
    },
    tax: {
      type: tax.type === "percent" || tax.type === "amount" ? tax.type : "none",
      value: Math.max(0, num(tax.value)),
      label: typeof tax.label === "string" && tax.label ? tax.label : "Tax",
    },
  };
}

/** An optional table counts only while the customer (or the default) includes it. */
export function pricingSectionIncluded(
  pricing: Pick<PricingBlockContent, "optional" | "selected">,
): boolean {
  return !pricing.optional || pricing.selected;
}

/**
 * Parent of a sub-item. Missing parents and parents that are themselves
 * sub-items are ignored so nesting stays one level deep.
 */
export function pricingLineParent(
  line: PricingLine,
  lines: PricingLine[],
): PricingLine | null {
  if (!line.parent_id || line.parent_id === line.id) return null;
  const parent = lines.find((candidate) => candidate.id === line.parent_id);
  if (!parent || parent.parent_id) return null;
  return parent;
}

/** A line counts when its table is included and, for a sub-item, its parent is included. */
export function pricingLineIncluded(
  line: PricingLine,
  lines: PricingLine[],
  sectionIncluded = true,
): boolean {
  if (!sectionIncluded) return false;
  const parent = pricingLineParent(line, lines);
  if (parent) return parent.selected || !parent.optional;
  return line.selected || !line.optional;
}

/** Top-level lines with their sub-items, in document order. */
export function groupPricingLines(lines: PricingLine[]): PricingLineGroup[] {
  const groups: PricingLineGroup[] = [];
  const byParent = new Map<string, PricingLineGroup>();
  for (const line of lines) {
    if (pricingLineParent(line, lines)) continue;
    const group: PricingLineGroup = { line, children: [] };
    groups.push(group);
    if (line.id) byParent.set(line.id, group);
  }
  for (const line of lines) {
    const parent = pricingLineParent(line, lines);
    if (!parent) continue;
    byParent.get(parent.id)?.children.push(line);
  }
  return groups;
}

export function flattenPricingGroups(groups: PricingLineGroup[]): PricingLine[] {
  return groups.flatMap((group) => [group.line, ...group.children]);
}

/** Drop a line. Deleting a parent also deletes its sub-items. */
export function removePricingLine(lines: PricingLine[], lineId: string): PricingLine[] {
  const target = lines.find((line) => line.id === lineId);
  if (!target) return lines;
  const drop = new Set<string>([lineId]);
  if (!pricingLineParent(target, lines)) {
    for (const line of lines) {
      if (line.parent_id === lineId) drop.add(line.id);
    }
  }
  return lines.filter((line) => !drop.has(line.id));
}

function clampPricingParents(lines: PricingLine[]): PricingLine[] {
  const ids = new Set(lines.map((line) => line.id).filter(Boolean));
  const linked = lines.map((line) => ({
    ...line,
    parent_id:
      line.parent_id && ids.has(line.parent_id) && line.parent_id !== line.id
        ? line.parent_id
        : null,
  }));
  const parentOf = new Map(linked.map((line) => [line.id, line.parent_id]));
  return linked.map((line) => {
    if (!line.parent_id) return line;
    if (parentOf.get(line.parent_id)) return { ...line, parent_id: null };
    return { ...line, optional: false, selected: true };
  });
}

export function computePricingTotals(
  content: Record<string, unknown> | null | undefined,
): DocumentTotals {
  const pricing = normalizePricingContent(content);
  if (!pricingSectionIncluded(pricing)) {
    return { subtotal: 0, discount_total: 0, tax_total: 0, total: 0 };
  }
  const subtotal = round2(
    pricing.lines
      .filter((line) => pricingLineIncluded(line, pricing.lines))
      .reduce((sum, line) => sum + line.qty * line.unit_price, 0),
  );
  let discount = 0;
  if (pricing.discount.type === "percent") {
    discount = round2(subtotal * (pricing.discount.value / 100));
  } else if (pricing.discount.type === "amount") {
    discount = round2(Math.min(pricing.discount.value, subtotal));
  }
  const taxable = round2(subtotal - discount);
  let tax = 0;
  if (pricing.tax.type === "percent") {
    tax = round2(taxable * (pricing.tax.value / 100));
  } else if (pricing.tax.type === "amount") {
    tax = round2(pricing.tax.value);
  }
  return {
    subtotal,
    discount_total: discount,
    tax_total: tax,
    total: round2(taxable + tax),
  };
}

/** Customer-facing label for a dropped-in quote total block. */
export function quoteBlockLabel(
  content: Record<string, unknown> | null | undefined,
): string {
  const label = typeof content?.label === "string" ? content.label.trim() : "";
  return label || "Quote";
}

/** Sum totals across all visible pricing blocks of a document. */
export function computeDocumentTotals(
  blocks: Array<{
    block_type: string;
    hidden: boolean;
    content: Record<string, unknown> | null;
  }>,
): DocumentTotals {
  return blocks
    .filter((b) => b.block_type === "pricing" && !b.hidden)
    .map((b) => computePricingTotals(b.content))
    .reduce(
      (acc, t) => ({
        subtotal: round2(acc.subtotal + t.subtotal),
        discount_total: round2(acc.discount_total + t.discount_total),
        tax_total: round2(acc.tax_total + t.tax_total),
        total: round2(acc.total + t.total),
      }),
      { subtotal: 0, discount_total: 0, tax_total: 0, total: 0 },
    );
}

/**
 * Apply customer option selections to pricing blocks. Only an optional table
 * or an optional top-level line can be toggled, and only qty_editable lines
 * can change quantity. Sub-items follow their parent and cannot be toggled
 * on their own.
 */
export function applyCustomerSelections(
  blocks: DocBlockSnapshot[],
  selections: Array<{
    block_id: string;
    line_id?: string;
    selected?: boolean;
    qty?: number;
    section_selected?: boolean;
  }>,
): DocBlockSnapshot[] {
  return blocks.map((block) => {
    if (block.block_type !== "pricing") return block;
    const updates = selections.filter((s) => s.block_id === block.id);
    if (!updates.length) return block;
    const pricing = normalizePricingContent(block.content);
    const sectionUpdate = [...updates]
      .reverse()
      .find((update) => typeof update.section_selected === "boolean");
    const nextPricing =
      sectionUpdate &&
      pricing.optional &&
      typeof sectionUpdate.section_selected === "boolean"
        ? { ...pricing, selected: sectionUpdate.section_selected }
        : pricing;
    const lines = nextPricing.lines.map((line) => {
      const update = [...updates]
        .reverse()
        .find((candidate) => candidate.line_id && candidate.line_id === line.id);
      if (!update) return line;
      const next = { ...line };
      const isChild = Boolean(pricingLineParent(line, nextPricing.lines));
      if (!isChild && line.optional && typeof update.selected === "boolean") {
        next.selected = update.selected;
      }
      if (line.qty_editable && typeof update.qty === "number") {
        next.qty = Math.max(0, Math.min(9999, Math.round(update.qty)));
      }
      return next;
    });
    return { ...block, content: { ...nextPricing, lines } };
  });
}

/** Statuses that still allow customer interaction on the public page. */
export function documentIsOpenForCustomer(status: string): boolean {
  return ["sent", "viewed", "customer_reviewing"].includes(status);
}

/** Statuses from which a document can be sent (or re-sent). */
export function documentIsSendable(status: string): boolean {
  return [
    "draft",
    "internal_review",
    "approved_to_send",
    "sent",
    "viewed",
    "customer_reviewing",
    "changes_requested",
  ].includes(status);
}

export function documentIsExpired(doc: {
  expires_at: string | null;
  status: string;
}): boolean {
  if (doc.status === "expired") return true;
  if (!doc.expires_at) return false;
  return new Date(doc.expires_at).getTime() < Date.now();
}
