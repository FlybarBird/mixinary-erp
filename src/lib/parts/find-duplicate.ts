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

function norm(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
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

type PartRow = {
  id: string;
  name: string;
  sku: string | null;
  upc: string | null;
  company_id: string | null;
  specs: unknown;
};

/** Build an in-memory index for fast duplicate checks during scrape import/review. */
export async function loadCatalogDuplicateIndex(supabase: Client) {
  const { data } = await supabase
    .from("catalog_parts")
    .select("id, name, sku, upc, company_id, specs");

  const byUpc = new Map<string, PartRow>();
  const bySku = new Map<string, PartRow[]>();
  const byUrl = new Map<string, PartRow>();
  const byNameCompany = new Map<string, PartRow>();

  for (const row of (data ?? []) as PartRow[]) {
    const upc = norm(row.upc);
    if (upc) byUpc.set(upc, row);

    const sku = norm(row.sku);
    if (sku) {
      const list = bySku.get(sku) || [];
      list.push(row);
      bySku.set(sku, list);
    }

    const url = scrapedFrom(row.specs);
    if (url) byUrl.set(norm(url), row);

    const name = norm(row.name);
    if (name) {
      byNameCompany.set(`${name}::${row.company_id || ""}`, row);
      if (!byNameCompany.has(`${name}::`)) {
        byNameCompany.set(`${name}::`, row);
      }
    }
  }

  return {
    find(candidate: DuplicateCandidate): DuplicateMatch | null {
      const upc = norm(candidate.upc);
      if (upc && byUpc.has(upc)) {
        const hit = byUpc.get(upc)!;
        return { id: hit.id, name: hit.name, reason: "upc" };
      }

      const sku = norm(candidate.sku);
      if (sku && bySku.has(sku)) {
        const list = bySku.get(sku)!;
        const companyId = candidate.company_id || null;
        const hit =
          (companyId
            ? list.find((r) => r.company_id === companyId)
            : null) || list[0];
        if (hit) return { id: hit.id, name: hit.name, reason: "sku" };
      }

      const url = norm(candidate.product_url);
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
    remember(part: PartRow & { product_url?: string | null }) {
      const upc = norm(part.upc);
      if (upc) byUpc.set(upc, part);
      const sku = norm(part.sku);
      if (sku) {
        const list = bySku.get(sku) || [];
        list.push(part);
        bySku.set(sku, list);
      }
      const url = norm(part.product_url || scrapedFrom(part.specs));
      if (url) byUrl.set(url, part);
      const name = norm(part.name);
      if (name) {
        byNameCompany.set(`${name}::${part.company_id || ""}`, part);
        if (!byNameCompany.has(`${name}::`)) {
          byNameCompany.set(`${name}::`, part);
        }
      }
    },
  };
}

export type CatalogDuplicateIndex = Awaited<
  ReturnType<typeof loadCatalogDuplicateIndex>
>;
