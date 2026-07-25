import { calculateLinePricing } from "@/lib/pricing";
import { laborLinePricing } from "@/lib/projects/labor-export";
import type { LaborEntry, LineItem, ProjectSection } from "@/lib/types";

export type InvoiceCategoryLine = {
  source: "BOM" | "Labor";
  category: string;
  description: string;
  amount: number;
};

function money(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Build invoice line items from BOM categories (fallback: section name)
 * and Labor work categories, using Sale amounts.
 */
export function invoiceLinesFromBomAndLabor(input: {
  sections: Array<Pick<ProjectSection, "id" | "name">>;
  bomLines: Array<
    Pick<
      LineItem,
      | "section_id"
      | "category"
      | "description"
      | "qty"
      | "msrp"
      | "quote"
      | "override_pct"
    >
  >;
  laborEntries: Array<
    Pick<
      LaborEntry,
      | "work_category"
      | "task_description"
      | "worker_name"
      | "qty"
      | "msrp"
      | "quote"
      | "override_pct"
      | "hourly_rate"
    >
  >;
  projectDefaultOverridePct?: number | null;
}): InvoiceCategoryLine[] {
  const sectionName = new Map(
    input.sections.map((s) => [s.id, String(s.name || "").trim() || "Section"]),
  );

  const bomBuckets = new Map<string, number>();
  for (const line of input.bomLines) {
    const pricing = calculateLinePricing({
      qty: line.qty,
      msrp: line.msrp,
      quote: line.quote,
      overridePct: line.override_pct,
      projectDefaultOverridePct: input.projectDefaultOverridePct,
    });
    if (pricing.totalSale === 0) continue;
    const cat =
      String(line.category || "").trim() ||
      (line.section_id ? sectionName.get(line.section_id) : null) ||
      "Uncategorized Materials";
    bomBuckets.set(cat, (bomBuckets.get(cat) || 0) + pricing.totalSale);
  }

  const laborBuckets = new Map<string, number>();
  for (const entry of input.laborEntries) {
    const pricing = laborLinePricing(entry, input.projectDefaultOverridePct);
    if (pricing.totalSale === 0) continue;
    const cat =
      String(entry.work_category || "").trim() ||
      String(entry.task_description || "").trim() ||
      "Labor";
    laborBuckets.set(cat, (laborBuckets.get(cat) || 0) + pricing.totalSale);
  }

  const lines: InvoiceCategoryLine[] = [];
  for (const [category, amount] of [...bomBuckets.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    lines.push({
      source: "BOM",
      category,
      description: `Materials — ${category}`,
      amount: money(amount),
    });
  }
  for (const [category, amount] of [...laborBuckets.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    lines.push({
      source: "Labor",
      category,
      description: `Labor — ${category}`,
      amount: money(amount),
    });
  }
  return lines;
}
