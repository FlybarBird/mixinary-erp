import { extractJson } from "@/lib/ai/openai";
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

export async function fetchAllowlistedHtml(url: string, sources: PriceSource[]) {
  if (!isAllowlistedUrl(url, sources)) {
    throw new Error(`URL domain is not in the allowlist: ${url}`);
  }

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "MixinaryERP/1.0 (+internal price lookup; contact admin)",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    throw new Error(`Fetch failed (${res.status}) for ${url}`);
  }

  const html = await res.text();
  // Keep prompt size manageable
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18000);

  return { htmlSnippet: cleaned, finalUrl: res.url || url };
}

export async function extractMsrpFromHtml(params: {
  query: string;
  sourceUrl: string;
  htmlSnippet: string;
}): Promise<MsrpExtraction> {
  return extractJson<MsrpExtraction>({
    system:
      "You extract product MSRP/list price from retailer or manufacturer page text. Return JSON with keys: product_name, sku, msrp (number or null), currency, source_url, confidence (0-1), notes. Prefer official MSRP/list price over sale/street if both exist. If unsure, lower confidence and set msrp null.",
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
