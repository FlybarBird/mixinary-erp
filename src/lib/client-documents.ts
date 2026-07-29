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
  /** Customer may include/exclude this line. */
  optional: boolean;
  /** Current selection (always true for required lines). */
  selected: boolean;
  /** Customer may adjust quantity. */
  qty_editable: boolean;
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
  lines: PricingLine[];
  discount: PricingDiscount;
  tax: PricingTax;
  [key: string]: unknown;
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
        lines: [] as PricingLine[],
        discount: { type: "none", value: 0 },
        tax: { type: "none", value: 0, label: "Tax" },
      } satisfies PricingBlockContent;
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
  return {
    ...raw,
    title: typeof raw.title === "string" ? raw.title : "Pricing",
    lines: lines.map((l) => {
      const line = l as Partial<PricingLine>;
      const optional = Boolean(line.optional);
      return {
        id: String(line.id ?? ""),
        name: String(line.name ?? ""),
        description: line.description == null ? null : String(line.description),
        category: line.category == null ? null : String(line.category),
        qty: Math.max(0, num(line.qty)),
        unit_price: num(line.unit_price),
        optional,
        selected: optional ? line.selected !== false : true,
        qty_editable: Boolean(line.qty_editable),
      };
    }),
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

export function computePricingTotals(
  content: Record<string, unknown> | null | undefined,
): DocumentTotals {
  const pricing = normalizePricingContent(content);
  const subtotal = round2(
    pricing.lines
      .filter((l) => l.selected || !l.optional)
      .reduce((sum, l) => sum + l.qty * l.unit_price, 0),
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
 * Apply customer option selections to pricing blocks. Only optional lines can
 * be toggled and only qty_editable lines can change quantity — everything else
 * in the document is untouchable from the public route.
 */
export function applyCustomerSelections(
  blocks: DocBlockSnapshot[],
  selections: Array<{
    block_id: string;
    line_id: string;
    selected?: boolean;
    qty?: number;
  }>,
): DocBlockSnapshot[] {
  return blocks.map((block) => {
    if (block.block_type !== "pricing") return block;
    const updates = selections.filter((s) => s.block_id === block.id);
    if (!updates.length) return block;
    const pricing = normalizePricingContent(block.content);
    const lines = pricing.lines.map((line) => {
      const update = updates.find((u) => u.line_id === line.id);
      if (!update) return line;
      const next = { ...line };
      if (line.optional && typeof update.selected === "boolean") {
        next.selected = update.selected;
      }
      if (line.qty_editable && typeof update.qty === "number") {
        next.qty = Math.max(0, Math.min(9999, Math.round(update.qty)));
      }
      return next;
    });
    return { ...block, content: { ...pricing, lines } };
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
