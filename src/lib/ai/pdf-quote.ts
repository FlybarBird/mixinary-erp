import { PDFParse } from "pdf-parse";
import { extractJson } from "@/lib/ai/openai";
import { bestMatch } from "@/lib/ai/match";
import type { LineItem } from "@/lib/types";

export interface ExtractedQuoteLine {
  sku: string | null;
  description: string | null;
  qty: number | null;
  unit_price: number | null;
  ext_price: number | null;
  vendor: string | null;
}

export interface ExtractedQuote {
  quote_number: string | null;
  quote_date: string | null;
  vendor: string | null;
  lines: ExtractedQuoteLine[];
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const text =
      typeof result === "string"
        ? result
        : ((result as { text?: string }).text ?? JSON.stringify(result));
    return text.slice(0, 60000);
  } finally {
    await parser.destroy();
  }
}

export async function extractQuoteFromPdfText(
  text: string,
  vendorHint?: string | null,
): Promise<ExtractedQuote> {
  return extractJson<ExtractedQuote>({
    system:
      "You extract vendor quote line items from PDF text. Return JSON: { quote_number, quote_date, vendor, lines: [{ sku, description, qty, unit_price, ext_price, vendor }] }. Use numbers for money/qty. Omit junk headers/totals as lines.",
    user: JSON.stringify({ vendor_hint: vendorHint ?? null, pdf_text: text }),
  });
}

export function matchQuoteLinesToProject(
  extracted: ExtractedQuoteLine[],
  projectLines: LineItem[],
) {
  const used = new Set<string>();
  return extracted.map((line, index) => {
    const remaining = projectLines.filter((p) => !used.has(p.id));
    const match = bestMatch(line, remaining, 0.45);
    if (match) used.add(match.item.id);
    return {
      sort_order: index,
      ...line,
      matched_line_item_id: match?.item.id ?? null,
      match_score: match?.score ?? null,
      action: match ? "update_quote" : "add_line",
      selected: true,
    };
  });
}
