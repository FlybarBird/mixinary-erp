import { NextResponse } from "next/server";
import { canEditPricing, getCurrentProfile } from "@/lib/auth";
import { refreshMsrpForLine } from "@/lib/ai/msrp";
import { createClient } from "@/lib/supabase/server";
import type { PriceSource } from "@/lib/types";

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canEditPricing(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const projectId = String(body.projectId);
  const lineItemIds = (body.lineItemIds ?? []) as string[];
  const productUrl = (body.productUrl as string | null) ?? null;

  if (!projectId || !lineItemIds.length) {
    return NextResponse.json(
      { error: "projectId and lineItemIds required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: job, error: jobError } = await supabase
    .from("ai_jobs")
    .insert({
      type: "msrp_fetch",
      status: "running",
      project_id: projectId,
      created_by: profile.id,
      input: { lineItemIds, productUrl },
    })
    .select("id")
    .single();

  if (jobError || !job) {
    return NextResponse.json(
      { error: jobError?.message || "Failed to create job" },
      { status: 400 },
    );
  }

  const [{ data: sources }, { data: lines }] = await Promise.all([
    supabase.from("price_sources").select("*").eq("enabled", true),
    supabase
      .from("line_items")
      .select("*")
      .eq("project_id", projectId)
      .in("id", lineItemIds),
  ]);

  const results = [];
  for (const line of lines ?? []) {
    try {
      const { extraction, source, usedUrl } = await refreshMsrpForLine({
        description: line.description,
        sku: line.sku,
        productUrl: lineItemIds.length === 1 ? productUrl : productUrl,
        sources: (sources ?? []) as PriceSource[],
      });

      const { data: row } = await supabase
        .from("price_fetch_results")
        .insert({
          job_id: job.id,
          line_item_id: line.id,
          price_source_id: source?.id ?? null,
          product_name: extraction.product_name,
          sku: extraction.sku,
          msrp: extraction.msrp,
          currency: extraction.currency || "USD",
          source_url: extraction.source_url || usedUrl,
          confidence: extraction.confidence,
          accepted: null,
          raw: extraction,
        })
        .select("id")
        .single();

      await supabase
        .from("line_items")
        .update({ fetch_error: null })
        .eq("id", line.id);

      results.push({ lineId: line.id, resultId: row?.id, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabase
        .from("line_items")
        .update({ fetch_error: message })
        .eq("id", line.id);
      results.push({ lineId: line.id, ok: false, error: message });
    }
  }

  await supabase
    .from("ai_jobs")
    .update({
      status: "needs_review",
      result: { results },
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  return NextResponse.json({ jobId: job.id });
}
