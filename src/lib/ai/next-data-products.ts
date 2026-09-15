export type NextDataProduct = {
  name: string;
  sku: string | null;
  upc: string | null;
  description: string | null;
  msrp: number | null;
  image_url: string | null;
  product_url: string | null;
  company: string | null;
  brand: string | null;
  source: string | null;
  confidence: number;
};

const TARGET_PART_LIMIT = 100;

function cleanText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim().replace(/\s+/g, " ");
  return text || null;
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

function partKey(part: NextDataProduct): string {
  return (part.product_url || part.sku || part.upc || part.name)
    .toLowerCase()
    .trim();
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function collectNextHits(node: unknown, out: Record<string, unknown>[]): void {
  if (!node || out.length >= TARGET_PART_LIMIT * 2) return;
  if (Array.isArray(node)) {
    for (const item of node) collectNextHits(item, out);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const hasProductShape =
    (typeof obj.productName === "string" || typeof obj.name === "string") &&
    (obj.price != null ||
      obj.url != null ||
      obj.objectID != null ||
      obj.sku != null);
  if (hasProductShape) out.push(obj);
  if (Array.isArray(obj.hits)) {
    for (const hit of obj.hits) {
      if (hit && typeof hit === "object") out.push(hit as Record<string, unknown>);
    }
  }
  for (const [key, value] of Object.entries(obj)) {
    if (key === "hits") continue;
    collectNextHits(value, out);
  }
}

/** Sweetwater / Next.js search & PDP embed product hits in __NEXT_DATA__. */
export function extractNextDataProducts(
  html: string,
  baseUrl: string,
): NextDataProduct[] {
  const match = html.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!match?.[1]) return [];

  let data: unknown;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return [];
  }

  const hits: Record<string, unknown>[] = [];
  collectNextHits(data, hits);

  const products: NextDataProduct[] = [];
  const seen = new Set<string>();
  let hostFallback = "sweetwater.com";
  try {
    hostFallback = new URL(baseUrl).hostname.replace(/^www\./, "");
  } catch {
    /* keep default */
  }

  for (const hit of hits) {
    const productName =
      cleanText(hit.productName) ||
      cleanText(hit.name) ||
      cleanText(hit.title);
    if (!productName) continue;

    const brand = cleanText(hit.brand);
    const objectId = cleanText(hit.objectID) || cleanText(hit.sku);
    const highlightSku =
      hit._highlightResult &&
      typeof hit._highlightResult === "object" &&
      (hit._highlightResult as { sku?: { value?: string } }).sku?.value
        ? cleanText(
            (hit._highlightResult as { sku?: { value?: string } }).sku?.value,
          )
        : null;

    const priceObj =
      hit.price && typeof hit.price === "object"
        ? (hit.price as Record<string, unknown>)
        : null;
    const msrp =
      readNumber(priceObj?.retailPrice) ??
      readNumber(priceObj?.catalogPrice) ??
      readNumber(priceObj?.basePrice) ??
      readNumber(priceObj?.finalPrice) ??
      readNumber(hit.msrp) ??
      readNumber(hit.price);

    const rawUrl =
      cleanText(hit.url) ||
      cleanText(hit.productUrl) ||
      cleanText(hit.product_url);
    const productUrl = rawUrl ? absolutize(rawUrl, baseUrl) : null;

    const imageObj =
      (hit.image_meta && typeof hit.image_meta === "object"
        ? (hit.image_meta as Record<string, unknown>)
        : null) ||
      (hit.image && typeof hit.image === "object"
        ? (hit.image as Record<string, unknown>)
        : null);
    const imageUrl =
      (imageObj?.pathAbsolute
        ? absolutize(String(imageObj.pathAbsolute), baseUrl)
        : null) ||
      (typeof hit.image === "string" ? absolutize(hit.image, baseUrl) : null);

    const description =
      cleanText(hit.longDescription) || cleanText(hit.description);
    const upc =
      highlightSku && /^\d{8,14}$/.test(highlightSku) ? highlightSku : null;

    const part: NextDataProduct = {
      name: brand ? `${brand} ${productName}` : productName,
      sku: objectId,
      upc,
      description,
      msrp,
      image_url: imageUrl && !looksLikeJunkImage(imageUrl) ? imageUrl : null,
      product_url: productUrl,
      company: brand,
      brand,
      source: hostFallback.includes("sweetwater") ? "Sweetwater" : hostFallback,
      confidence: msrp != null ? 0.92 : 0.8,
    };

    const key = partKey(part);
    if (seen.has(key)) continue;
    seen.add(key);
    products.push(part);
    if (products.length >= TARGET_PART_LIMIT) break;
  }

  return products;
}
