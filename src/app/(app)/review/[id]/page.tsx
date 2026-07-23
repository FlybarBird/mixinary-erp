import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogScrapeReview } from "@/components/CatalogScrapeReview";
import { MsrpReview } from "@/components/MsrpReview";
import { QuoteReview } from "@/components/QuoteReview";
import { requireProfile } from "@/lib/auth";
import { loadCatalogDuplicateIndex } from "@/lib/parts/find-duplicate";
import { createClient } from "@/lib/supabase/server";

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireProfile();
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("ai_jobs")
    .select("*, projects(id, project_number, name)")
    .eq("id", id)
    .maybeSingle();

  if (!job) notFound();

  const project = job.projects as {
    id: string;
    project_number: string;
    name: string;
  } | null;

  if (job.type === "msrp_fetch") {
    const { data: results } = await supabase
      .from("price_fetch_results")
      .select("*, line_items(description, msrp)")
      .eq("job_id", job.id);

    return (
      <div className="stack">
        <div>
          <p className="muted" style={{ margin: 0 }}>
            <Link href="/review">AI Review</Link> / MSRP
          </p>
          <h1 className="page-title">MSRP review</h1>
          <p className="page-sub">
            {project?.project_number} · {project?.name} · {job.status}
          </p>
        </div>
        {job.error ? <p style={{ color: "var(--danger)" }}>{job.error}</p> : null}
        <MsrpReview
          jobId={job.id}
          results={(results ?? []).map((r) => ({
            id: r.id,
            product_name: r.product_name,
            sku: r.sku,
            msrp: r.msrp,
            confidence: r.confidence,
            source_url: r.source_url,
            line_items: r.line_items as {
              description: string;
              msrp: number;
            } | null,
          }))}
        />
      </div>
    );
  }

  if (job.type === "catalog_scrape") {
    const { data: proposals } = await supabase
      .from("catalog_part_proposals")
      .select("*")
      .eq("job_id", job.id)
      .order("created_at");
    const input = (job.input || {}) as {
      url?: string;
      company_id?: string | null;
    };
    const result = (job.result || {}) as {
      finalUrl?: string;
      count?: number;
      withImages?: number;
      candidateImageCount?: number;
    };
    const imageCount =
      result.withImages ??
      (proposals ?? []).filter((p) => Boolean(p.image_url)).length;

    const dupIndex = await loadCatalogDuplicateIndex(supabase);
    const seenInBatch = new Set<string>();
    const annotated = (proposals ?? []).map((p) => {
      const companyId =
        (p.company_id as string | null) || input.company_id || null;
      let duplicate = dupIndex.find({
        sku: p.sku,
        upc: p.upc,
        name: p.name,
        company_id: companyId,
        product_url: p.product_url,
      });

      const batchKey = [
        String(p.upc || "").trim().toLowerCase(),
        String(p.sku || "").trim().toLowerCase(),
        String(p.product_url || "").trim().toLowerCase(),
        String(p.name || "").trim().toLowerCase(),
      ].find((k) => k);
      if (!duplicate && batchKey) {
        if (seenInBatch.has(batchKey)) {
          duplicate = {
            id: "",
            name: String(p.name),
            reason: "name",
          };
        } else {
          seenInBatch.add(batchKey);
        }
      } else if (batchKey) {
        seenInBatch.add(batchKey);
      }

      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        upc: p.upc,
        description: p.description,
        msrp: p.msrp,
        image_url: p.image_url,
        product_url: p.product_url,
        brand: p.brand ?? null,
        company_name: p.company_name ?? null,
        source_name: p.source_name ?? null,
        confidence: p.confidence,
        duplicate,
      };
    });
    const duplicateCount = annotated.filter((p) => p.duplicate).length;

    return (
      <div className="stack">
        <div>
          <p className="muted" style={{ margin: 0 }}>
            <Link href="/review">AI Review</Link> / Catalog scrape
          </p>
          <h1 className="page-title">Parts scrape review</h1>
          <p className="page-sub">
            {result.count ?? proposals?.length ?? 0} proposed · {imageCount} with
            images
            {duplicateCount ? ` · ${duplicateCount} duplicates` : ""}
            {result.candidateImageCount != null
              ? ` · ${result.candidateImageCount} images found on page`
              : ""}{" "}
            · {job.status}
            {result.finalUrl || input.url
              ? ` · ${result.finalUrl || input.url}`
              : ""}
          </p>
        </div>
        {job.error ? <p style={{ color: "var(--danger)" }}>{job.error}</p> : null}
        <CatalogScrapeReview jobId={job.id} proposals={annotated} />
      </div>
    );
  }

  const { data: upload } = await supabase
    .from("quote_uploads")
    .select("*")
    .eq("job_id", job.id)
    .maybeSingle();

  const [{ data: lines }, { data: sections }] = await Promise.all([
    upload
      ? supabase
          .from("quote_extracted_lines")
          .select("*, line_items:matched_line_item_id(description, quote)")
          .eq("upload_id", upload.id)
          .order("sort_order")
      : Promise.resolve({ data: [] }),
    job.project_id
      ? supabase
          .from("project_sections")
          .select("id, name")
          .eq("project_id", job.project_id)
          .order("sort_order")
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <div className="stack">
      <div>
        <p className="muted" style={{ margin: 0 }}>
          <Link href="/review">AI Review</Link> / PDF Quote
        </p>
        <h1 className="page-title">Quote review</h1>
        <p className="page-sub">
          {project?.project_number} · {upload?.file_name} ·{" "}
          {upload?.quote_number || "No quote #"}
        </p>
      </div>
      {job.error ? <p style={{ color: "var(--danger)" }}>{job.error}</p> : null}
      <QuoteReview
        jobId={job.id}
        projectId={job.project_id!}
        sections={sections ?? []}
        lines={(lines ?? []).map((line) => ({
          id: line.id,
          sku: line.sku,
          description: line.description,
          qty: line.qty,
          unit_price: line.unit_price,
          action: line.action,
          match_score: line.match_score,
          selected: line.selected,
          matched: line.line_items as {
            description: string;
            quote: number | null;
          } | null,
        }))}
      />
    </div>
  );
}
