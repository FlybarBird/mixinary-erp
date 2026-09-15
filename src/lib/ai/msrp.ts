import { extractJson } from "@/lib/ai/openai";
import { fetchHtmlDocument } from "@/lib/ai/fetch-html";
import { extractNextDataProducts } from "@/lib/ai/next-data-products";
import type { PriceSource } from "@/lib/types";

export interface MsrpExtraction {
  product_name: string | null;
  sku: string | null;
  msrp: number | null;
  currency: string;
  source_url: string | null;
  confidence: number;
  notes?: string;
}

function isAllowlistedUrl(url: string, sources: PriceSource[]): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return sources.some(
      (s) =>
        s.enabled &&
        (host === s.base_domain || host.endsWith(`.${s.base_domain}`)),
    );
  } catch {
    return false;
  }
}

export function buildSearchUrl(
  source: PriceSource,
  query: string,
): string | null {
  if (!source.enabled || !source.supports_search || !source.search_url_template) {
    return null;
  }
  return source.search_url_template.replace(
    "{query}",
    encodeURIComponent(query),
  );
}

function htmlToTextSnippet(html: string, limit = 18000): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

/** Keep structured Next.js product rows in the MSRP prompt (scripts are otherwise stripped). */
function nextDataPriceHint(html: string, pageUrl: string): string {
  try {
    const products = extractNextDataProducts(html, pageUrl).slice(0, 25);
    if (!products.length) return "";
    return (
      "\nSTRUCTURED_PRODUCTS: " +
      JSON.stringify(
        products.map((p) => ({
          name: p.name,
          sku: p.sku,
          msrp: p.msrp,
          product_url: p.product_url,
          brand: p.brand,
        })),
      )
    );
  } catch {
    return "";
  }
}

export async function fetchAllowlistedHtml(url: string, sources: PriceSource[]) {
  if (!isAllowlistedUrl(url, sources)) {
    throw new Error(`URL domain is not in the allowlist: ${url}`);
  }

  const { html, finalUrl } = await fetchHtmlDocument(url, { timeoutMs: 20000 });
  const cleaned =
    htmlToTextSnippet(html) + nextDataPriceHint(html, finalUrl || url);

  return { htmlSnippet: cleaned.slice(0, 24000), finalUrl: finalUrl || url };
}

export async function extractMsrpFromHtml(params: {
  query: string;
  sourceUrl: string;
  htmlSnippet: string;
}): Promise<MsrpExtraction> {
  return extractJson<MsrpExtraction>({
    system:
      "You extract product MSRP/list price from retailer or manufacturer page text. Return JSON with keys: product_name, sku, msrp (number or null), currency, source_url, confidence (0-1), notes. Prefer official MSRP/list price over sale/street if both exist. If STRUCTURED_PRODUCTS is present, prefer matching that list. If unsure, lower confidence and set msrp null.",
    user: JSON.stringify({
      search_query: params.query,
      source_url: params.sourceUrl,
      page_text: params.htmlSnippet,
    }),
  });
}

export async function refreshMsrpForLine(params: {
  description: string;
  sku?: string | null;
  productUrl?: string | null;
  sources: PriceSource[];
}): Promise<{
  extraction: MsrpExtraction;
  source: PriceSource | null;
  usedUrl: string;
}> {
  const query = [params.sku, params.description].filter(Boolean).join(" ");
  const enabled = params.sources.filter((s) => s.enabled);

  if (params.productUrl) {
    const { htmlSnippet, finalUrl } = await fetchAllowlistedHtml(
      params.productUrl,
      enabled,
    );
    const extraction = await extractMsrpFromHtml({
      query,
      sourceUrl: finalUrl,
      htmlSnippet,
    });
    const host = new URL(finalUrl).hostname.replace(/^www\./, "");
    const source =
      enabled.find(
        (s) => host === s.base_domain || host.endsWith(`.${s.base_domain}`),
      ) ?? null;
    return { extraction, source, usedUrl: finalUrl };
  }

  const searchable = enabled.filter((s) => s.supports_search);
  let lastError: Error | null = null;

  for (const source of searchable) {
    const url = buildSearchUrl(source, query);
    if (!url) continue;
    try {
      const { htmlSnippet, finalUrl } = await fetchAllowlistedHtml(url, enabled);
      const extraction = await extractMsrpFromHtml({
        query,
        sourceUrl: finalUrl,
        htmlSnippet,
      });
      if (extraction.msrp != null && extraction.confidence >= 0.4) {
        return { extraction, source, usedUrl: finalUrl };
      }
      lastError = new Error(
        extraction.notes || `Low confidence from ${source.name}`,
      );
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error("No allowlisted price source returned MSRP");
}
