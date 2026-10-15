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

/** Customer-facing pricing line. Sale prices never include vendor cost. */
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
  /** BOM or labor rows whose sale price this quote line follows. */
  links: PricingSourceLink[];
}

/** A BOM line or labor entry tied to a customer-facing quote line. */
export interface PricingSourceLink {
  source: "bom" | "labor";
  id: string;
}

/** Current customer sale price of a linked BOM or labor row. */
export interface PricingSourcePrice extends PricingSourceLink {
  name: string;
  qty: number;
  unit_price: number;
  total: number;
}

/** A linked quote line whose BOM or labor price has changed, or whose source is gone. */
export interface QuoteLinkChange {
  lineId: string;
  lineName: string;
  currentTotal: number;
  nextQty: number;
  nextUnit: number;
  nextTotal: number;
  priceChanged: boolean;
  missingCount: number;
  linkedNames: string[];
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

function normalizeSourceLinks(value: unknown): PricingSourceLink[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const links: PricingSourceLink[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const source = (raw as { source?: unknown }).source;
    const id = String((raw as { id?: unknown }).id ?? "").trim();
    if ((source !== "bom" && source !== "labor") || !id) continue;
    const key = `${source}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ source, id });
  }
  return links;
}

function sourceKey(link: PricingSourceLink) {
  return `${link.source}:${link.id}`;
}

/**
 * Compare a quote line with the live sale prices of its linked BOM and labor
 * rows. One link keeps that row's quantity and unit price. Several links roll
 * up into a single quantity of 1. Nothing is changed until the proposal is applied.
 */
export function quoteLinkProposal(
  line: Pick<PricingLine, "id" | "name" | "qty" | "unit_price" | "links">,
  sources: PricingSourcePrice[],
): QuoteLinkChange | null {
  const links = line.links ?? [];
  if (!links.length) return null;
  const byKey = new Map(sources.map((source) => [sourceKey(source), source]));
  const present: PricingSourcePrice[] = [];
  let missingCount = 0;
  for (const link of links) {
    const found = byKey.get(sourceKey(link));
    if (found) present.push(found);
    else missingCount += 1;
  }
  let nextQty = line.qty;
  let nextUnit = line.unit_price;
  if (present.length === 1) {
    nextQty = present[0]!.qty;
    nextUnit = present[0]!.unit_price;
  } else if (present.length > 1) {
    nextQty = 1;
    nextUnit = round2(present.reduce((sum, source) => sum + source.total, 0));
  }
  const priceChanged =
    round2(nextQty) !== round2(line.qty) || round2(nextUnit) !== round2(line.unit_price);
  if (!priceChanged && missingCount === 0) return null;
  return {
    lineId: line.id,
    lineName: line.name.trim() || "Untitled item",
    currentTotal: round2(line.qty * line.unit_price),
    nextQty,
    nextUnit,
    nextTotal: round2(nextQty * nextUnit),
    priceChanged,
    missingCount,
    linkedNames: present.map((source) => source.name),
  };
}

/** Apply a link proposal: refresh the sale price and drop links whose source is gone. */
export function applyQuoteLinkProposal(
  line: PricingLine,
  sources: PricingSourcePrice[],
): PricingLine {
  const proposal = quoteLinkProposal(line, sources);
  if (!proposal) return line;
  const live = new Set(sources.map((source) => sourceKey(source)));
  const links = line.links.filter((link) => live.has(sourceKey(link)));
  if (!proposal.priceChanged) return { ...line, links };
  return {
    ...line,
    links,
    qty: proposal.nextQty,
    unit_price: proposal.nextUnit,
  };
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
          links: normalizeSourceLinks(line.links),
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

export type PricingDropPlace = "before" | "after";

export interface PricingDropMarker {
  /** Existing row that should show the insertion line. */
  rowId: string;
  place: PricingDropPlace;
  /** The dropped line will land as a sub-item. */
  nest: boolean;
}

/**
 * Drag a pricing line.
 *
 * A parent item moves together with its sub-items, among the other top-level
 * items. A sub-item, or a top-level item that has no sub-items, can also be
 * dropped under another item when `nest` is set. Without `nest`, that line
 * stays at the top level and lands before or after the target item.
 */
export function movePricingLine(
  lines: PricingLine[],
  fromId: string,
  toId: string,
  place: PricingDropPlace,
  nest = false,
): PricingLine[] {
  if (!fromId || !toId || fromId === toId) return lines;
  const groups = groupPricingLines(lines);
  const fromIndex = groups.findIndex(
    (group) =>
      group.line.id === fromId || group.children.some((child) => child.id === fromId),
  );
  const toIndex = groups.findIndex(
    (group) => group.line.id === toId || group.children.some((child) => child.id === toId),
  );
  if (fromIndex < 0 || toIndex < 0) return lines;
  const fromGroup = groups[fromIndex]!;
  const movingBlock = fromGroup.line.id === fromId && fromGroup.children.length > 0;

  if (movingBlock) {
    if (fromGroup.line.id === toId || fromGroup.children.some((child) => child.id === toId)) {
      return lines;
    }
    const next = groups.filter((_, index) => index !== fromIndex);
    const dest = next.findIndex(
      (group) => group.line.id === toId || group.children.some((child) => child.id === toId),
    );
    if (dest < 0) return lines;
    const targetIsParent = next[dest]!.line.id === toId;
    const insertAt = !targetIsParent || place === "after" ? dest + 1 : dest;
    next.splice(insertAt, 0, fromGroup);
    return samePricingOrder(lines, flattenPricingGroups(next))
      ? lines
      : flattenPricingGroups(next);
  }

  const moving =
    fromGroup.line.id === fromId
      ? fromGroup.line
      : fromGroup.children.find((child) => child.id === fromId);
  if (!moving) return lines;
  const remaining = groups
    .map((group, index) => {
      if (index !== fromIndex) return group;
      if (group.line.id === fromId) return null;
      return {
        ...group,
        children: group.children.filter((child) => child.id !== fromId),
      };
    })
    .filter((group): group is PricingLineGroup => group !== null);
  const dest = remaining.findIndex(
    (group) => group.line.id === toId || group.children.some((child) => child.id === toId),
  );
  if (dest < 0) return lines;
  const target = remaining[dest]!;
  const targetIsParent = target.line.id === toId;

  if (nest) {
    const adopted: PricingLine = {
      ...moving,
      parent_id: target.line.id,
      optional: false,
      selected: true,
    };
    const children = [...target.children];
    if (targetIsParent) {
      children.unshift(adopted);
    } else {
      const childIndex = children.findIndex((child) => child.id === toId);
      const at =
        childIndex < 0 ? children.length : place === "before" ? childIndex : childIndex + 1;
      children.splice(at, 0, adopted);
    }
    remaining[dest] = { ...target, children };
  } else {
    const insertAt = place === "before" ? dest : dest + 1;
    remaining.splice(insertAt, 0, { line: { ...moving, parent_id: null }, children: [] });
  }

  const next = flattenPricingGroups(remaining);
  return samePricingOrder(lines, next) ? lines : next;
}

/** Where the insertion line should appear for a drag hover. */
export function pricingDropMarker(
  lines: PricingLine[],
  fromId: string,
  toId: string,
  place: PricingDropPlace,
  nest = false,
): PricingDropMarker | null {
  const next = movePricingLine(lines, fromId, toId, place, nest);
  if (next === lines) return null;
  const groups = groupPricingLines(next);
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index]!;
    if (group.line.id === fromId) {
      if (index === 0) {
        const following = groups[index + 1];
        return following
          ? { rowId: following.line.id, place: "before", nest: false }
          : null;
      }
      const previous = groups[index - 1]!;
      const last = previous.children[previous.children.length - 1] ?? previous.line;
      return { rowId: last.id, place: "after", nest: false };
    }
    const childIndex = group.children.findIndex((child) => child.id === fromId);
    if (childIndex >= 0) {
      if (childIndex === 0) {
        return { rowId: group.line.id, place: "after", nest: true };
      }
      return {
        rowId: group.children[childIndex - 1]!.id,
        place: "after",
        nest: true,
      };
    }
  }
  return null;
}

function samePricingOrder(current: PricingLine[], next: PricingLine[]): boolean {
  if (current.length !== next.length) return false;
  return current.every((line, index) => {
    const other = next[index];
    return (
      other != null &&
      line.id === other.id &&
      line.parent_id === other.parent_id &&
      line.optional === other.optional &&
      line.selected === other.selected
    );
  });
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
