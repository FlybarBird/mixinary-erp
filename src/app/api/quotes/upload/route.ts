import { NextResponse } from "next/server";
import { canEditPricing, getCurrentProfile } from "@/lib/auth";
import {
  extractQuoteFromPdfText,
  extractTextFromPdf,
  matchQuoteLinesToProject,
} from "@/lib/ai/pdf-quote";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { LineItem } from "@/lib/types";

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canEditPricing(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await request.formData();
  const projectId = String(form.get("projectId") || "");
  const vendorHint = (form.get("vendorHint") as string | null) || null;
  const file = form.get("file");

  if (!projectId || !(file instanceof File)) {
    return NextResponse.json(
      { error: "projectId and PDF file required" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const supabase = await createClient();
  const service = createServiceClient();

  const path = `${projectId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error: uploadError } = await service.storage
    .from("quote-pdfs")
    .upload(path, buffer, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `Storage upload failed: ${uploadError.message}` },
      { status: 400 },
    );
  }

  const { data: job, error: jobError } = await supabase
    .from("ai_jobs")
    .insert({
      type: "pdf_quote",
      status: "running",
      project_id: projectId,
      created_by: profile.id,
      input: { fileName: file.name, path, vendorHint },
    })
    .select("id")
    .single();

  if (jobError || !job) {
    return NextResponse.json(
      { error: jobError?.message || "Failed to create job" },
      { status: 400 },
    );
  }

  const { data: upload, error: uploadRowError } = await supabase
    .from("quote_uploads")
    .insert({
      project_id: projectId,
      job_id: job.id,
      file_path: path,
      file_name: file.name,
      vendor_hint: vendorHint,
      status: "running",
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (uploadRowError || !upload) {
    return NextResponse.json(
      { error: uploadRowError?.message || "Failed to save upload" },
      { status: 400 },
    );
  }

  try {
    const text = await extractTextFromPdf(buffer);
    const extracted = await extractQuoteFromPdfText(text, vendorHint);
    const { data: projectLines } = await supabase
      .from("line_items")
      .select("*")
      .eq("project_id", projectId);

    const matched = matchQuoteLinesToProject(
      extracted.lines ?? [],
      (projectLines ?? []) as LineItem[],
    );

    if (matched.length) {
      await supabase.from("quote_extracted_lines").insert(
        matched.map((line) => ({
          upload_id: upload.id,
          sort_order: line.sort_order,
          sku: line.sku,
          description: line.description,
          qty: line.qty,
          unit_price: line.unit_price,
          ext_price: line.ext_price,
          vendor: line.vendor,
          matched_line_item_id: line.matched_line_item_id,
          match_score: line.match_score,
          action: line.action,
          selected: line.selected,
          raw: line,
        })),
      );
    }

    await supabase
      .from("quote_uploads")
      .update({
        status: "needs_review",
        quote_number: extracted.quote_number,
        quote_date: extracted.quote_date,
        vendor_hint: extracted.vendor || vendorHint,
      })
      .eq("id", upload.id);

    await supabase
      .from("ai_jobs")
      .update({
        status: "needs_review",
        result: {
          uploadId: upload.id,
          quote_number: extracted.quote_number,
          lineCount: matched.length,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return NextResponse.json({ jobId: job.id, uploadId: upload.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("quote_uploads")
      .update({ status: "failed" })
      .eq("id", upload.id);
    await supabase
      .from("ai_jobs")
      .update({
        status: "failed",
        error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
