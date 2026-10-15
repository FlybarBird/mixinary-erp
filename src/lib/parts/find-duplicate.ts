import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export type DuplicateMatch = {
  id: string;
  name: string;
  reason: "upc" | "sku" | "product_url" | "name";
};

export type DuplicateCandidate = {
  sku?: string | null;
  upc?: string | null;
  name?: string | null;
  company_id?: string | null;
  product_url?: string | null;
};

export type DuplicatePartRow = {
  id: string;
  name: string;
  sku: string | null;
  upc: string | null;
  company_id: string | null;
  specs: unknown;
  product_url?: string | null;
};

function norm(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Ignore placeholder codes that show up on many unrelated devices. */
function usefulCode(value: string | null | undefined): string {
  const code = norm(value).replace(/[^a-z0-9]/g, "");
  if (!code || code === "0" || code === "na" || code === "n" || code === "none") {
    return "";
  }
  return norm(value);
}

export function canonicalUrl(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.origin}${path}${url.search}`.toLowerCase();
  } catch {
    return norm(raw);
  }
}

export function sameUrl(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = canonicalUrl(a);
  const right = canonicalUrl(b);
  return Boolean(left) && left === right;
}

/** Category, search, and listing pages are not a single device. */
export function looksLikeSharedListing(value: string | null | undefined): boolean {
  const raw = String(value || "").trim();
  if (!raw) return false;
  try {
    const url = new URL(raw);
    const path = url.pathname.toLowerCase();
    if (
      /\/(search|category|categories|collections|collection|browse|shop|c|s)(\/|$)/i.test(
        path,
      )
    ) {
      return true;
    }
    const params = url.search.toLowerCase();
    if (/[?&](q|query|search|page|p)=/.test(params)) return true;
  } catch {
    return false;
  }
  return false;
}

export function productIdentityUrl(
  productUrl: string | null | undefined,
  listingUrls: Array<string | null | undefined> = [],
): string | null {
  const raw = String(productUrl || "").trim();
  if (!raw) return null;
  if (listingUrls.some((listing) => sameUrl(raw, listing))) return null;
  if (looksLikeSharedListing(raw)) return null;
  return raw;
}

/**
 * Key for "same device in this scrape batch".
 * A shared listing URL must not collapse distinct devices.
 */
export function proposalIdentityKey(
  part: DuplicateCandidate,
  listingUrls: Array<string | null | undefined> = [],
): string | null {
  const upc = usefulCode(part.upc);
  if (upc) return `upc:${upc}`;
  const sku = usefulCode(part.sku);
  const name = norm(part.name);
  if (sku && name) return `sku:${sku}::${name}`;
  if (sku) return `sku:${sku}`;
  const url = canonicalUrl(productIdentityUrl(part.product_url, listingUrls));
  if (url) return `url:${url}`;
  if (name) return `name:${name}`;
  return null;
}

function scrapedFrom(specs: unknown): string | null {
  if (!specs) return null;
  let obj = specs;
  if (typeof specs === "string") {
    try {
      obj = JSON.parse(specs);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;
  const url = (obj as { scraped_from?: unknown }).scraped_from;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

/** In-memory index for scrape import/review. SKU alone is not enough. */
export function createDuplicateIndex(rows: DuplicatePartRow[]) {
  const byUpc = new Map<string, DuplicatePartRow>();
  const bySku = new Map<string, DuplicatePartRow[]>();
  const byUrl = new Map<string, DuplicatePartRow>();
  const byNameCompany = new Map<string, DuplicatePartRow>();

  function indexRow(row: DuplicatePartRow) {
    const upc = usefulCode(row.upc);
    if (upc) byUpc.set(upc, row);

    const sku = usefulCode(row.sku);
    if (sku) {
      const list = bySku.get(sku) || [];
      list.push(row);
      bySku.set(sku, list);
    }

    const url = canonicalUrl(
      productIdentityUrl(row.product_url || scrapedFrom(row.specs)),
    );
    if (url) byUrl.set(url, row);

    const name = norm(row.name);
    if (name) {
      byNameCompany.set(`${name}::${row.company_id || ""}`, row);
      if (!byNameCompany.has(`${name}::`)) {
        byNameCompany.set(`${name}::`, row);
      }
    }
  }

  for (const row of rows) indexRow(row);

  return {
    find(candidate: DuplicateCandidate): DuplicateMatch | null {
      const upc = usefulCode(candidate.upc);
      if (upc && byUpc.has(upc)) {
        const hit = byUpc.get(upc)!;
        return { id: hit.id, name: hit.name, reason: "upc" };
      }

      const sku = usefulCode(candidate.sku);
      if (sku && bySku.has(sku)) {
        const list = bySku.get(sku)!;
        const companyId = candidate.company_id || null;
        const name = norm(candidate.name);
        const hit = list.find((row) => {
          if (companyId && row.company_id === companyId) return true;
          if (name && norm(row.name) === name) return true;
          return false;
        });
        if (hit) return { id: hit.id, name: hit.name, reason: "sku" };
      }

      const url = canonicalUrl(productIdentityUrl(candidate.product_url));
      if (url && byUrl.has(url)) {
        const hit = byUrl.get(url)!;
        return { id: hit.id, name: hit.name, reason: "product_url" };
      }

      const name = norm(candidate.name);
      if (name) {
        const companyId = candidate.company_id || "";
        const hit =
          byNameCompany.get(`${name}::${companyId}`) ||
          (!companyId ? byNameCompany.get(`${name}::`) : null);
        if (hit) return { id: hit.id, name: hit.name, reason: "name" };
      }

      return null;
    },
    /** Register a just-imported part so later rows in the same batch collide. */
    remember(part: DuplicatePartRow) {
      indexRow(part);
    },
  };
}

export type CatalogDuplicateIndex = ReturnType<typeof createDuplicateIndex>;

export async function loadCatalogDuplicateIndex(supabase: Client) {
  const { data } = await supabase
    .from("catalog_parts")
    .select("id, name, sku, upc, company_id, specs");

  return createDuplicateIndex((data ?? []) as DuplicatePartRow[]);
}
