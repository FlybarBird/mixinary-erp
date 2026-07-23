export interface EnrichmentResult {
  source: "icecat" | "upcitemdb";
  name: string | null;
  description: string | null;
  sku: string | null;
  upc: string | null;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  specs: Record<string, unknown> | null;
  raw?: unknown;
}

async function enrichFromIcecat(params: {
  brand: string;
  sku: string;
}): Promise<EnrichmentResult | null> {
  const user = process.env.ICECAT_USERNAME;
  const pass = process.env.ICECAT_PASSWORD;
  if (!user || !pass) return null;

  const url = new URL("https://data.icecat.biz/xml_s3/xml_server3.cgi");
  url.searchParams.set("lang", "en");
  url.searchParams.set("prod_id", params.sku);
  url.searchParams.set("vendor", params.brand);
  url.searchParams.set("output", "productxml");

  const auth = Buffer.from(`${user}:${pass}`).toString("base64");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return null;
  const xml = await res.text();
  if (!xml.includes("<Product") || xml.includes('ErrorMessage')) return null;

  const name =
    xml.match(/Title[^>]*Value="([^"]+)"/i)?.[1] ||
    xml.match(/<Name[^>]*>([^<]+)<\/Name>/i)?.[1] ||
    null;
  const description =
    xml.match(/ShortDesc[^>]*Value="([^"]+)"/i)?.[1] ||
    xml.match(/<ShortSummaryDescription>([^<]+)</i)?.[1] ||
    null;
  const image =
    xml.match(/HighPic="([^"]+)"/i)?.[1] ||
    xml.match(/LowPic="([^"]+)"/i)?.[1] ||
    null;
  const upc =
    xml.match(/GTIN="([^"]+)"/i)?.[1] ||
    xml.match(/EANCode="([^"]+)"/i)?.[1] ||
    null;

  return {
    source: "icecat",
    name,
    description,
    sku: params.sku,
    upc,
    brand: params.brand,
    category: null,
    image_url: image,
    specs: { icecat: true },
  };
}

async function enrichFromUpcitemdb(params: {
  upc?: string;
  query?: string;
}): Promise<EnrichmentResult | null> {
  const key = process.env.UPCITEMDB_USER_KEY || process.env.UPCITEMDB_API_KEY;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (key) headers.user_key = key;

  let url: string;
  if (params.upc) {
    url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(params.upc)}`;
  } else if (params.query) {
    url = `https://api.upcitemdb.com/prod/trial/search?s=${encodeURIComponent(params.query)}&match_mode=0&type=product`;
  } else {
    return null;
  }

  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    items?: Array<{
      title?: string;
      description?: string;
      brand?: string;
      model?: string;
      upc?: string;
      ean?: string;
      category?: string;
      images?: string[];
    }>;
  };
  const item = data.items?.[0];
  if (!item) return null;

  return {
    source: "upcitemdb",
    name: item.title ?? null,
    description: item.description ?? item.title ?? null,
    sku: item.model ?? null,
    upc: item.upc || item.ean || params.upc || null,
    brand: item.brand ?? null,
    category: item.category ?? null,
    image_url: item.images?.[0] ?? null,
    specs: { category: item.category },
    raw: item,
  };
}

export async function enrichPart(input: {
  brand?: string | null;
  sku?: string | null;
  upc?: string | null;
  query?: string | null;
}): Promise<EnrichmentResult> {
  if (input.brand && input.sku) {
    const icecat = await enrichFromIcecat({
      brand: input.brand,
      sku: input.sku,
    });
    if (icecat?.name || icecat?.image_url) return icecat;
  }

  if (input.upc) {
    const byUpc = await enrichFromUpcitemdb({ upc: input.upc });
    if (byUpc) return byUpc;
  }

  const query =
    input.query ||
    [input.brand, input.sku].filter(Boolean).join(" ") ||
    null;
  if (query) {
    const bySearch = await enrichFromUpcitemdb({ query });
    if (bySearch) return bySearch;
  }

  throw new Error(
    "No enrichment result. Configure ICECAT_USERNAME/ICECAT_PASSWORD and/or UPCITEMDB_USER_KEY, or check brand/SKU/UPC.",
  );
}
