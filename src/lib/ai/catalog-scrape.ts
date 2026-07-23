import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { extractJson } from "@/lib/ai/openai";

export interface ScrapedPart {
  name: string;
  sku: string | null;
  upc: string | null;
  description: string | null;
  msrp: number | null;
  image_url: string | null;
  product_url: string | null;
  /** Manufacturer / company name (e.g. Shure, Blackmagic). */
  company: string | null;
  /** Brand when distinct from company (often same as company). */
  brand: string | null;
  /** Site / retailer source (e.g. B&H Photo, shure.com). */
  source: string | null;
  confidence: number;
}

const MAX_BYTES = 2_000_000;
const TEXT_LIMIT = 150_000;
const IMAGE_CANDIDATE_LIMIT = 200;
const LINK_CANDIDATE_LIMIT = 150;
const TARGET_PART_LIMIT = 100;
const EXTRACT_BATCH_SIZE = 25;

function isPrivateIp(ip: string): boolean {
  if (ip === "127.0.0.1" || ip === "::1" || ip === "0.0.0.0") return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("169.254.")) return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) {
    return true;
  }
  const parts = ip.split(".").map(Number);
  if (parts.length === 4 && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
    return true;
  }
  if (parts.length === 4 && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) {
    return true;
  }
  return false;
}

async function assertPublicHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new Error("Local/internal hostnames are not allowed");
  }

  if (isIP(host)) {
    if (isPrivateIp(host)) {
      throw new Error("Private IP addresses are not allowed");
    }
    return;
  }

  const records = await lookup(host, { all: true });
  if (!records.length) {
    throw new Error(`Could not resolve host: ${host}`);
  }
  for (const record of records) {
    if (isPrivateIp(record.address)) {
      throw new Error(`Host resolves to a private address: ${record.address}`);
    }
  }
}

export async function assertSafePublicUrl(url: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URLs with credentials are not allowed");
  }

  await assertPublicHostname(parsed.hostname);
  return parsed;
}

function absolutize(raw: string, baseUrl: string): string | null {
  const value = raw.trim().replace(/&amp;/g, "&");
  if (!value || value.startsWith("data:") || value.startsWith("blob:")) {
    return null;
  }
  try {
    const abs = new URL(value, baseUrl);
    if (abs.protocol !== "http:" && abs.protocol !== "https:") return null;
    return abs.toString();
  } catch {
    return null;
  }
}

function looksLikeJunkImage(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes("sprite") ||
    lower.includes("favicon") ||
    lower.includes("1x1") ||
    lower.includes("pixel") ||
    lower.includes("tracking") ||
    lower.includes("spacer") ||
    lower.endsWith(".svg") ||
    /\/icons?\//.test(lower) ||
    /logo[-_]?(small|icon)?\./.test(lower)
  );
}

function firstFromSrcset(srcset: string): string | null {
  // "a.jpg 1x, b.jpg 2x" or "a.jpg 200w, b.jpg 400w" — prefer last (usually largest)
  const parts = srcset
    .split(",")
    .map((p) => p.trim().split(/\s+/)[0])
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

function extractSiteName(html: string, baseUrl: string): string | null {
  const patterns = [
    /property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*property=["']og:site_name["']/i,
    /property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
    /<title[^>]*>([^<]+)<\/title>/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]?.trim()) {
      const value = match[1].trim().replace(/\s+/g, " ");
      // Prefer short site names; skip long product titles from <title>
      if (value.length <= 80) return value;
    }
  }
  try {
    return new URL(baseUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Pull product image / link candidates before tags are stripped for AI text. */
export function extractMediaCandidates(html: string, baseUrl: string) {
  const images = new Set<string>();
  const links = new Set<string>();
  const siteName = extractSiteName(html, baseUrl);

  const metaPatterns = [
    /property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/gi,
    /content=["']([^"']+)["'][^>]*property=["']og:image(?::secure_url)?["']/gi,
    /name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/gi,
    /content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["']/gi,
  ];
  for (const pattern of metaPatterns) {
    for (const match of html.matchAll(pattern)) {
      const abs = absolutize(match[1], baseUrl);
      if (abs && !looksLikeJunkImage(abs)) images.add(abs);
    }
  }

  for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
    const chunk = tag[0];
    const attrs = [
      chunk.match(/\bsrc=["']([^"']+)["']/i)?.[1],
      chunk.match(/\bdata-src=["']([^"']+)["']/i)?.[1],
      chunk.match(/\bdata-original=["']([^"']+)["']/i)?.[1],
      chunk.match(/\bdata-lazy-src=["']([^"']+)["']/i)?.[1],
      chunk.match(/\bdata-image=["']([^"']+)["']/i)?.[1],
    ];
    const srcset = chunk.match(/\bsrcset=["']([^"']+)["']/i)?.[1];
    if (srcset) {
      const fromSrcset = firstFromSrcset(srcset);
      if (fromSrcset) attrs.push(fromSrcset);
    }
    for (const raw of attrs) {
      if (!raw) continue;
      const abs = absolutize(raw, baseUrl);
      if (abs && !looksLikeJunkImage(abs)) images.add(abs);
    }
  }

  // JSON-LD image fields (common on PDP/listing pages)
  for (const match of html.matchAll(
    /"image"\s*:\s*(?:"([^"]+)"|\[\s*"([^"]+)")/gi,
  )) {
    const raw = match[1] || match[2];
    const abs = absolutize(raw, baseUrl);
    if (abs && !looksLikeJunkImage(abs)) images.add(abs);
  }

  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi)) {
    const abs = absolutize(match[1], baseUrl);
    if (!abs) continue;
    if (looksLikeProductLink(abs, baseUrl)) links.add(abs);
  }

  const structuredProducts = extractJsonLdProducts(html, baseUrl).slice(
    0,
    TARGET_PART_LIMIT,
  );
  for (const product of structuredProducts) {
    if (product.product_url) links.add(product.product_url);
    if (product.image_url && !looksLikeJunkImage(product.image_url)) {
      images.add(product.image_url);
    }
  }

  return {
    candidateImages: [...images].slice(0, IMAGE_CANDIDATE_LIMIT),
    candidateLinks: [...links].slice(0, LINK_CANDIDATE_LIMIT),
    siteName,
    structuredProducts,
  };
}

function looksLikeProductLink(url: string, pageUrl: string): boolean {
  try {
    const abs = new URL(url);
    const page = new URL(pageUrl);
    if (abs.hostname !== page.hostname) return false;
    const path = abs.pathname.toLowerCase();
    if (path.length < 4 || path === "/" || path.endsWith(".css") || path.endsWith(".js")) {
      return false;
    }
    if (
      /\/(cart|login|account|search|category|categories|collections?|brand|brands|blog|about|contact|help|support|faq|policy|privacy|terms|wishlist|compare)(\/|$)/i.test(
        path,
      )
    ) {
      return false;
    }
    return (
      /\/(product|products|p|item|items|sku|dp|buy|shop|detail|details|model|equipment|gear)\b/i.test(
        path,
      ) ||
      /\/[a-z0-9][^/]*-[a-z0-9][^/]*$/i.test(path) ||
      /[?&](sku|product|item|pid|id)=/i.test(abs.search)
    );
  } catch {
    return false;
  }
}

function extractJsonLdProducts(html: string, baseUrl: string): ScrapedPart[] {
  const products: ScrapedPart[] = [];
  const seen = new Set<string>();

  const scripts = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );

  for (const match of scripts) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    walkJsonLd(data, baseUrl, products, seen);
  }

  return products;
}

function walkJsonLd(
  node: unknown,
  baseUrl: string,
  out: ScrapedPart[],
  seen: Set<string>,
) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) walkJsonLd(item, baseUrl, out, seen);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const type = obj["@type"];
  const types = Array.isArray(type)
    ? type.map(String)
    : type
      ? [String(type)]
      : [];

  if (types.some((t) => /product/i.test(t))) {
    const part = jsonLdToPart(obj, baseUrl);
    if (part) {
      const key = (part.product_url || part.sku || part.name).toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(part);
      }
    }
  }

  if (types.some((t) => /itemlist/i.test(t)) && Array.isArray(obj.itemListElement)) {
    for (const el of obj.itemListElement) {
      const item =
        el && typeof el === "object" && "item" in el
          ? (el as { item: unknown }).item
          : el;
      walkJsonLd(item, baseUrl, out, seen);
    }
  }

  if (Array.isArray(obj["@graph"])) walkJsonLd(obj["@graph"], baseUrl, out, seen);
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") walkJsonLd(value, baseUrl, out, seen);
  }
}

function jsonLdToPart(
  obj: Record<string, unknown>,
  baseUrl: string,
): ScrapedPart | null {
  const name = cleanText(obj.name);
  if (!name) return null;

  let imageRaw: unknown = obj.image;
  if (Array.isArray(imageRaw)) imageRaw = imageRaw[0];
  if (imageRaw && typeof imageRaw === "object" && imageRaw !== null) {
    imageRaw = (imageRaw as { url?: string }).url;
  }

  let productUrl =
    (typeof obj.url === "string" && obj.url) ||
    (typeof obj["@id"] === "string" && obj["@id"]) ||
    null;
  productUrl = productUrl ? absolutize(productUrl, baseUrl) : null;

  let msrp: number | null = null;
  const offers = obj.offers;
  const offer = Array.isArray(offers) ? offers[0] : offers;
  if (offer && typeof offer === "object") {
    const price = (offer as { price?: unknown }).price;
    const n = typeof price === "number" ? price : Number(price);
    if (Number.isFinite(n)) msrp = n;
  }

  const brandObj = obj.brand;
  let brand: string | null = null;
  if (typeof brandObj === "string") brand = cleanText(brandObj);
  else if (brandObj && typeof brandObj === "object") {
    brand = cleanText((brandObj as { name?: unknown }).name);
  }

  return {
    name,
    sku: cleanText(obj.sku) || cleanText(obj.mpn) || cleanText(obj.productID),
    upc: cleanText(obj.gtin) || cleanText(obj.gtin13) || cleanText(obj.gtin12),
    description: cleanText(obj.description),
    msrp,
    image_url: imageRaw
      ? normalizeImageUrl(String(imageRaw), baseUrl, [])
      : null,
    product_url: productUrl,
    company: brand,
    brand,
    source: null,
    confidence: 0.85,
  };
}

export async function fetchPublicHtml(url: string) {
  const parsed = await assertSafePublicUrl(url);

  const res = await fetch(parsed.toString(), {
    headers: {
      "User-Agent":
        "MixinaryERP/1.0 (+catalog scrape; contact admin)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(25000),
  });

  if (!res.ok) {
    throw new Error(`Fetch failed (${res.status}) for ${url}`);
  }

  const finalUrl = res.url || parsed.toString();
  let finalParsed: URL;
  try {
    finalParsed = new URL(finalUrl);
  } catch {
    throw new Error("Redirect target was not a valid URL");
  }
  if (finalParsed.protocol !== "http:" && finalParsed.protocol !== "https:") {
    throw new Error("Redirect target protocol is not allowed");
  }
  await assertPublicHostname(finalParsed.hostname);

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    throw new Error("Page is too large to scrape");
  }

  const html = new TextDecoder("utf-8").decode(buf);
  const {
    candidateImages,
    candidateLinks,
    siteName,
    structuredProducts,
  } = extractMediaCandidates(html, finalUrl);

  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TEXT_LIMIT);

  return {
    htmlSnippet: cleaned,
    finalUrl,
    candidateImages,
    candidateLinks,
    siteName,
    structuredProducts,
  };
}

function normalizeImageUrl(
  raw: string | null | undefined,
  pageUrl: string,
  candidates: string[],
): string | null {
  if (!raw) return null;
  const abs = absolutize(String(raw), pageUrl);
  if (!abs || looksLikeJunkImage(abs)) return null;
  // Prefer exact candidate match when AI returns a relative/partial path
  const hit = candidates.find(
    (c) => c === abs || c.includes(abs) || abs.includes(c),
  );
  return hit || abs;
}

function cleanText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim().replace(/\s+/g, " ");
  return text || null;
}

function partKey(part: ScrapedPart): string {
  return (
    part.product_url ||
    part.sku ||
    part.upc ||
    part.name
  )
    .toLowerCase()
    .trim();
}

function mergeParts(existing: ScrapedPart[], incoming: ScrapedPart[]): ScrapedPart[] {
  const byKey = new Map<string, ScrapedPart>();
  for (const part of existing) byKey.set(partKey(part), part);
  for (const part of incoming) {
    const key = partKey(part);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, part);
      continue;
    }
    byKey.set(key, {
      ...prev,
      ...Object.fromEntries(
        Object.entries(part).filter(([, v]) => v != null && v !== ""),
      ),
      name: prev.name || part.name,
      confidence: Math.max(prev.confidence, part.confidence),
    } as ScrapedPart);
  }
  return [...byKey.values()];
}

function nameFromProductUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    const slug = path.split("/").filter(Boolean).pop() || "";
    const cleaned = decodeURIComponent(slug)
      .replace(/\.(html?|php|aspx)$/i, "")
      .replace(/[-_+]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length < 3 || /^\d+$/.test(cleaned)) return null;
    return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return null;
  }
}

function normalizeScrapedPart(
  p: Partial<ScrapedPart>,
  pageUrl: string,
  candidateImages: string[],
  defaultSource: string | null,
): ScrapedPart | null {
  const name = String(p.name || "").trim();
  if (!name) return null;
  const company = cleanText(p.company);
  const brand = cleanText(p.brand) || company;
  return {
    name,
    sku: cleanText(p.sku),
    upc: cleanText(p.upc),
    description: cleanText(p.description),
    msrp:
      typeof p.msrp === "number" && Number.isFinite(p.msrp) ? p.msrp : null,
    image_url: normalizeImageUrl(p.image_url, pageUrl, candidateImages),
    product_url: p.product_url
      ? absolutize(String(p.product_url), pageUrl)
      : null,
    company,
    brand,
    source: cleanText(p.source) || defaultSource,
    confidence:
      typeof p.confidence === "number" && Number.isFinite(p.confidence)
        ? Math.max(0, Math.min(1, p.confidence))
        : 0.5,
  };
}

async function extractPartsBatch(params: {
  url: string;
  htmlSnippet: string;
  candidateImages: string[];
  candidateLinks: string[];
  siteName: string | null;
  knownCompanies: string[];
  batchMax: number;
}): Promise<ScrapedPart[]> {
  const defaultSource =
    cleanText(params.siteName) ||
    (() => {
      try {
        return new URL(params.url).hostname.replace(/^www\./, "");
      } catch {
        return null;
      }
    })();

  const result = await extractJson<{ parts: ScrapedPart[] }>({
    maxTokens: 12288,
    system:
      `You extract product catalog items from retailer or manufacturer listing/search/category page text. Return JSON: {"parts":[{"name","sku","upc","description","msrp","image_url","product_url","company","brand","source","confidence"}]}. name is required. company = manufacturer/company (e.g. Shure, Blackmagic Design). brand = product brand when known (often same as company). source = website/retailer name — use site_name when provided. msrp is a number or null (prefer list/MSRP over sale). confidence is 0-1. Extract EVERY distinct product in the provided candidate_links and page_text (up to ${params.batchMax}). Do not stop early. Skip nav, ads, and unrelated links. For image_url and product_url, prefer values from candidate_images / candidate_links (absolute URLs). Prefer known_companies names when they match. Do not invent URLs.`,
    user: JSON.stringify({
      page_url: params.url,
      site_name: params.siteName || defaultSource,
      known_companies: params.knownCompanies,
      page_text: params.htmlSnippet,
      candidate_images: params.candidateImages,
      candidate_links: params.candidateLinks,
      target_count: params.batchMax,
    }),
  });

  const parts = Array.isArray(result.parts) ? result.parts : [];
  return parts
    .map((p) =>
      normalizeScrapedPart(p, params.url, params.candidateImages, defaultSource),
    )
    .filter((p): p is ScrapedPart => Boolean(p));
}

export async function extractPartsFromHtml(params: {
  url: string;
  htmlSnippet: string;
  candidateImages?: string[];
  candidateLinks?: string[];
  structuredProducts?: ScrapedPart[];
  siteName?: string | null;
  knownCompanies?: string[];
}): Promise<ScrapedPart[]> {
  const candidateImages = params.candidateImages ?? [];
  const candidateLinks = params.candidateLinks ?? [];
  const knownCompanies = params.knownCompanies ?? [];
  const siteName = params.siteName ?? null;
  let hostFallback: string | null = null;
  try {
    hostFallback = new URL(params.url).hostname.replace(/^www\./, "");
  } catch {
    hostFallback = null;
  }
  const defaultSource = cleanText(siteName) || hostFallback;

  let parts: ScrapedPart[] = (params.structuredProducts ?? [])
    .map((p) =>
      normalizeScrapedPart(
        { ...p, source: p.source || defaultSource },
        params.url,
        candidateImages,
        defaultSource,
      ),
    )
    .filter((p): p is ScrapedPart => Boolean(p));

  const textChunks: string[] = [];
  const chunkSize = 35_000;
  const overlap = 2_000;
  if (params.htmlSnippet.length <= chunkSize) {
    textChunks.push(params.htmlSnippet);
  } else {
    for (let i = 0; i < params.htmlSnippet.length; i += chunkSize - overlap) {
      textChunks.push(params.htmlSnippet.slice(i, i + chunkSize));
      if (textChunks.length >= 4) break;
    }
  }

  const linkBatches: string[][] = [];
  if (!candidateLinks.length) {
    linkBatches.push([]);
  } else {
    for (let i = 0; i < candidateLinks.length; i += EXTRACT_BATCH_SIZE) {
      linkBatches.push(candidateLinks.slice(i, i + EXTRACT_BATCH_SIZE));
    }
  }

  const batchCount = Math.max(textChunks.length, linkBatches.length);
  for (let i = 0; i < batchCount && parts.length < TARGET_PART_LIMIT; i += 1) {
    const text = textChunks[Math.min(i, textChunks.length - 1)] || "";
    const links = linkBatches[Math.min(i, linkBatches.length - 1)] || [];
    const imageSlice = candidateImages.slice(
      i * 40,
      i * 40 + 80,
    );
    try {
      const batch = await extractPartsBatch({
        url: params.url,
        htmlSnippet: text,
        candidateImages: imageSlice.length ? imageSlice : candidateImages.slice(0, 80),
        candidateLinks: links,
        siteName,
        knownCompanies,
        batchMax: EXTRACT_BATCH_SIZE,
      });
      parts = mergeParts(parts, batch);
    } catch {
      // Continue with other batches / structured data
    }
  }

  // Fill remaining slots from product links the model skipped
  if (parts.length < TARGET_PART_LIMIT) {
    const have = new Set(
      parts.map((p) => (p.product_url || "").toLowerCase()).filter(Boolean),
    );
    const seeded: ScrapedPart[] = [];
    for (const link of candidateLinks) {
      if (parts.length + seeded.length >= TARGET_PART_LIMIT) break;
      if (have.has(link.toLowerCase())) continue;
      const name = nameFromProductUrl(link);
      if (!name) continue;
      seeded.push({
        name,
        sku: null,
        upc: null,
        description: null,
        msrp: null,
        image_url: null,
        product_url: link,
        company: null,
        brand: null,
        source: defaultSource,
        confidence: 0.35,
      });
      have.add(link.toLowerCase());
    }
    parts = mergeParts(parts, seeded);
  }

  return parts.slice(0, TARGET_PART_LIMIT);
}

const FORCE_PULL_LIMIT = 25;
const FORCE_PULL_CONCURRENCY = 3;

/**
 * Visit each product page and pick the best image (og:image / candidates).
 * When force=true, replaces existing images; otherwise only fills missing ones.
 */
export async function pullProductImages(
  parts: ScrapedPart[],
  options: { force?: boolean } = {},
): Promise<{ parts: ScrapedPart[]; pulled: number }> {
  const force = Boolean(options.force);
  const targets = parts
    .map((part, index) => ({ part, index }))
    .filter(
      ({ part }) =>
        Boolean(part.product_url) && (force || !part.image_url),
    )
    .slice(0, FORCE_PULL_LIMIT);

  if (!targets.length) {
    return { parts, pulled: 0 };
  }

  const next = parts.map((p) => ({ ...p }));
  let pulled = 0;

  for (let i = 0; i < targets.length; i += FORCE_PULL_CONCURRENCY) {
    const batch = targets.slice(i, i + FORCE_PULL_CONCURRENCY);
    await Promise.all(
      batch.map(async ({ part, index }) => {
        const productUrl = part.product_url;
        if (!productUrl) return;
        try {
          const page = await fetchPublicHtml(productUrl);
          const best = page.candidateImages[0] ?? null;
          if (!best) return;
          if (force || !next[index].image_url) {
            next[index] = { ...next[index], image_url: best };
            pulled += 1;
          }
        } catch {
          // Skip unreachable / blocked product pages
        }
      }),
    );
  }

  return { parts: next, pulled };
}
