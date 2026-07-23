import { NextResponse } from "next/server";
import {
  assertSafePublicUrl,
  extractPartsFromHtml,
  fetchPublicHtml,
  pullProductImages,
} from "@/lib/ai/catalog-scrape";
import { isOpenAIConfigured } from "@/lib/ai/openai";
import { canEditPricing, getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canEditPricing(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const url = String(body.url || "").trim();
  const companyId = (body.company_id as string | null) || null;
  const categoryId = (body.category_id as string | null) || null;
  const defaultVendorId = (body.default_vendor_id as string | null) || null;
  const forcePullImages = Boolean(body.force_pull_images);

  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  try {
    await assertSafePublicUrl(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!isOpenAIConfigured()) {
    return NextResponse.json(
      {
        error:
          "OpenAI API key is not configured. Add it under Admin → AI Settings.",
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: job, error: jobError } = await supabase
    .from("ai_jobs")
    .insert({
      type: "catalog_scrape",
      status: "running",
      project_id: null,
      created_by: profile.id,
      input: {
        url,
        company_id: companyId,
        category_id: categoryId,
        default_vendor_id: defaultVendorId,
        force_pull_images: forcePullImages,
      },
    })
    .select("id")
    .single();

  if (jobError || !job) {
    return NextResponse.json(
      { error: jobError?.message || "Failed to create job" },
      { status: 400 },
    );
  }

  try {
    const {
      htmlSnippet,
      finalUrl,
      candidateImages,
      candidateLinks,
      siteName,
      structuredProducts,
    } = await fetchPublicHtml(url);

    const { data: companies } = await supabase
      .from("part_companies")
      .select("name")
      .order("name");
    const knownCompanies = (companies ?? [])
      .map((c) => c.name)
      .filter(Boolean);

    let parts = await extractPartsFromHtml({
      url: finalUrl,
      htmlSnippet,
      candidateImages,
      candidateLinks,
      structuredProducts,
      siteName,
      knownCompanies,
    });

    let imagesPulled = 0;
    if (forcePullImages && parts.length) {
      const pulled = await pullProductImages(parts, { force: true });
      parts = pulled.parts;
      imagesPulled = pulled.pulled;
    }

    if (!parts.length) {
      await supabase
        .from("ai_jobs")
        .update({
          status: "failed",
          error: "No products found on that page",
          result: {
            finalUrl,
            siteName,
            count: 0,
            candidateImageCount: candidateImages.length,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      return NextResponse.json(
        { error: "No products found on that page", jobId: job.id },
        { status: 422 },
      );
    }

    const withImages = parts.filter((p) => p.image_url).length;

    const rows = parts.map((part) => ({
      job_id: job.id,
      name: part.name,
      sku: part.sku,
      upc: part.upc,
      description: part.description,
      msrp: part.msrp,
      image_url: part.image_url,
      product_url: part.product_url || finalUrl,
      brand: part.brand,
      company_name: part.company,
      source_name: part.source || siteName,
      confidence: part.confidence,
      category_id: categoryId,
      company_id: companyId,
      accepted: null,
      raw: part,
    }));

    const { error: insertError } = await supabase
      .from("catalog_part_proposals")
      .insert(rows);

    if (insertError) {
      throw new Error(insertError.message);
    }

    await supabase
      .from("ai_jobs")
      .update({
        status: "needs_review",
        result: {
          finalUrl,
          siteName,
          count: parts.length,
          withImages,
          imagesPulled,
          forcePullImages,
          candidateImageCount: candidateImages.length,
        },
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return NextResponse.json({
      jobId: job.id,
      count: parts.length,
      withImages,
      imagesPulled,
      candidateImageCount: candidateImages.length,
      siteName,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("ai_jobs")
      .update({
        status: "failed",
        error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return NextResponse.json(
      { error: message, jobId: job.id },
      { status: 400 },
    );
  }
}
