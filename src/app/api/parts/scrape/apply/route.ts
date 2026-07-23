import { NextResponse } from "next/server";
import { fetchPublicHtml } from "@/lib/ai/catalog-scrape";
import { canEditPricing, getCurrentProfile } from "@/lib/auth";
import { newId } from "@/lib/local/db";
import { cacheRemotePartImage } from "@/lib/parts/cache-image";
import { loadCatalogDuplicateIndex } from "@/lib/parts/find-duplicate";
import { resolveCompanyId } from "@/lib/parts/resolve-company";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canEditPricing(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const jobId = String(body.jobId || "");
  const acceptedIds = new Set((body.acceptedIds ?? []) as string[]);
  const forcePullImages = Boolean(body.forcePullImages);

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
    company_id?: string | null;
    category_id?: string | null;
    default_vendor_id?: string | null;
  };

  const { data: proposals } = await supabase
    .from("catalog_part_proposals")
    .select("*")
    .eq("job_id", jobId);

  const dupIndex = await loadCatalogDuplicateIndex(supabase);

  let imported = 0;
  let skippedDuplicates = 0;
  let imagesCached = 0;

  for (const proposal of proposals ?? []) {
    const accepted = acceptedIds.has(proposal.id) && Boolean(proposal.name);
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

    const productUrl = proposal.product_url as string | null;
    const duplicate = dupIndex.find({
      sku: proposal.sku,
      upc: proposal.upc,
      name: proposal.name,
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
    let imageUrl = proposal.image_url as string | null;
    let imagePath: string | null = null;

    if (forcePullImages && productUrl) {
      try {
        const page = await fetchPublicHtml(productUrl);
        const best = page.candidateImages[0] ?? null;
        if (best) imageUrl = best;
      } catch {
        // keep existing image_url
      }
    }

    if (imageUrl) {
      const cached = await cacheRemotePartImage({
        partId,
        remoteUrl: imageUrl,
      });
      if (cached) {
        imageUrl = cached.image_url;
        imagePath = cached.image_path;
        imagesCached += 1;
      }
    }

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
      name: proposal.name,
      sku: proposal.sku,
      upc: proposal.upc,
      description: proposal.description,
      msrp: proposal.msrp ?? 0,
      image_url: imageUrl,
      image_path: imagePath,
      category_id: proposal.category_id || input.category_id || null,
      company_id: companyId,
      default_vendor_id: input.default_vendor_id || null,
      source: sourceName,
      active: true,
      specs,
    });

    if (!error) {
      imported += 1;
      dupIndex.remember({
        id: partId,
        name: String(proposal.name),
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
    }
  }

  const priorResult =
    job.result && typeof job.result === "object"
      ? (job.result as Record<string, unknown>)
      : {};

  await supabase
    .from("ai_jobs")
    .update({
      status: "applied",
      result: {
        ...priorResult,
        imported,
        skippedDuplicates,
        imagesCached,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  return NextResponse.json({
    ok: true,
    imported,
    skippedDuplicates,
    imagesCached,
  });
}
