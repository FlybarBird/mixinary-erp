import { NextResponse } from "next/server";
import { canEditPricing, getCurrentProfile } from "@/lib/auth";
import { newId } from "@/lib/local/db";
import { cacheRemotePartImage } from "@/lib/parts/cache-image";
import {
  loadCatalogDuplicateIndex,
  productIdentityUrl,
} from "@/lib/parts/find-duplicate";
import { resolveCompanyId } from "@/lib/parts/resolve-company";
import { createClient } from "@/lib/supabase/server";

function money(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canEditPricing(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const jobId = String(body.jobId || "");
  const acceptedIds = new Set((body.acceptedIds ?? []) as string[]);

  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: job } = await supabase
    .from("ai_jobs")
    .select("id, type, input, result")
    .eq("id", jobId)
    .maybeSingle();

  if (!job || job.type !== "catalog_scrape") {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const input = (job.input || {}) as {
    url?: string | null;
    company_id?: string | null;
    category_id?: string | null;
    default_vendor_id?: string | null;
  };
  const priorResult =
    job.result && typeof job.result === "object"
      ? (job.result as Record<string, unknown>)
      : {};
  const listingUrls = [
    input.url,
    typeof priorResult.finalUrl === "string" ? priorResult.finalUrl : null,
  ];

  const { data: proposals } = await supabase
    .from("catalog_part_proposals")
    .select("*")
    .eq("job_id", jobId);

  const dupIndex = await loadCatalogDuplicateIndex(supabase);

  let imported = 0;
  let skippedDuplicates = 0;
  let imagesCached = 0;
  const failures: Array<{ id: string; name: string; error: string }> = [];
  const imageJobs: Array<{ partId: string; remoteUrl: string }> = [];

  for (const proposal of proposals ?? []) {
    const name = String(proposal.name || "").trim();
    const accepted = acceptedIds.has(proposal.id) && Boolean(name);
    await supabase
      .from("catalog_part_proposals")
      .update({ accepted })
      .eq("id", proposal.id);

    if (!accepted) continue;

    const companyName =
      (proposal.company_name as string | null) ||
      (proposal.brand as string | null);
    const companyId = await resolveCompanyId(
      supabase,
      companyName,
      (proposal.company_id as string | null) || input.company_id || null,
    );

    const productUrl = productIdentityUrl(
      proposal.product_url as string | null,
      listingUrls,
    );
    const duplicate = dupIndex.find({
      sku: proposal.sku,
      upc: proposal.upc,
      name,
      company_id: companyId,
      product_url: productUrl,
    });

    if (duplicate) {
      skippedDuplicates += 1;
      await supabase
        .from("catalog_part_proposals")
        .update({
          accepted: false,
          company_id: companyId,
          raw: {
            ...(typeof proposal.raw === "object" && proposal.raw
              ? proposal.raw
              : {}),
            skipped_duplicate: duplicate,
          },
        })
        .eq("id", proposal.id);
      continue;
    }

    const partId = newId();
    const imageUrl = (proposal.image_url as string | null) || null;
    const sourceName =
      (proposal.source_name as string | null)?.trim() || "scrape";
    const specs = {
      scraped_from: productUrl,
      confidence: proposal.confidence,
      source_image_url: proposal.image_url,
      brand: proposal.brand,
      company: proposal.company_name,
      source: proposal.source_name,
    };

    const { error } = await supabase.from("catalog_parts").insert({
      id: partId,
      name,
      sku: proposal.sku || null,
      upc: proposal.upc || null,
      description: proposal.description || null,
      msrp: money(proposal.msrp),
      image_url: imageUrl,
      image_path: null,
      category_id: proposal.category_id || input.category_id || null,
      company_id: companyId,
      default_vendor_id: input.default_vendor_id || null,
      source: sourceName,
      active: true,
      specs,
    });

    if (error) {
      failures.push({ id: proposal.id, name, error: error.message });
      continue;
    }

    imported += 1;
    dupIndex.remember({
      id: partId,
      name,
      sku: proposal.sku,
      upc: proposal.upc,
      company_id: companyId,
      specs,
      product_url: productUrl,
    });
    await supabase
      .from("catalog_part_proposals")
      .update({ company_id: companyId })
      .eq("id", proposal.id);

    if (imageUrl) imageJobs.push({ partId, remoteUrl: imageUrl });
  }

  const cacheUntil = Date.now() + 12_000;
  for (let i = 0; i < imageJobs.length; i += 4) {
    if (Date.now() > cacheUntil) break;
    const slice = imageJobs.slice(i, i + 4);
    await Promise.all(
      slice.map(async (jobImage) => {
        const cached = await cacheRemotePartImage(jobImage);
        if (!cached) return;
        const { error } = await supabase
          .from("catalog_parts")
          .update({
            image_url: cached.image_url,
            image_path: cached.image_path,
          })
          .eq("id", jobImage.partId);
        if (!error) imagesCached += 1;
      }),
    );
  }

  await supabase
    .from("ai_jobs")
    .update({
      status: imported > 0 ? "applied" : "needs_review",
      result: {
        ...priorResult,
        imported,
        skippedDuplicates,
        imagesCached,
        failures,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  return NextResponse.json({
    ok: failures.length === 0,
    imported,
    skippedDuplicates,
    imagesCached,
    failures,
  });
}
