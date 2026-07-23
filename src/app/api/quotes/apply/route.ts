import { NextResponse } from "next/server";
import { canEditPricing, getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canEditPricing(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const jobId = String(body.jobId);
  const selectedIds = new Set((body.selectedLineIds ?? []) as string[]);
  const defaultSectionId = (body.defaultSectionId as string | null) ?? null;

  const supabase = await createClient();
  const { data: job } = await supabase
    .from("ai_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (!job?.project_id) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const { data: upload } = await supabase
    .from("quote_uploads")
    .select("*")
    .eq("job_id", jobId)
    .maybeSingle();

  if (!upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  const { data: extracted } = await supabase
    .from("quote_extracted_lines")
    .select("*")
    .eq("upload_id", upload.id)
    .order("sort_order");

  let sectionId = defaultSectionId;
  if (!sectionId) {
    const { data: section } = await supabase
      .from("project_sections")
      .select("id")
      .eq("project_id", job.project_id)
      .order("sort_order")
      .limit(1)
      .maybeSingle();
    sectionId = section?.id ?? null;
  }

  for (const line of extracted ?? []) {
    const selected = selectedIds.has(line.id);
    await supabase
      .from("quote_extracted_lines")
      .update({ selected })
      .eq("id", line.id);

    if (!selected) continue;

    if (line.matched_line_item_id && line.action === "update_quote") {
      await supabase
        .from("line_items")
        .update({
          quote: line.unit_price,
          qty: line.qty ?? undefined,
        })
        .eq("id", line.matched_line_item_id);
    } else if (line.action === "add_line") {
      await supabase.from("line_items").insert({
        project_id: job.project_id,
        section_id: sectionId,
        description: line.description || "Quoted item",
        sku: line.sku,
        qty: line.qty ?? 1,
        msrp: line.unit_price ?? 0,
        quote: line.unit_price,
        notes: `Added from quote ${upload.quote_number || upload.file_name}`,
      });
    }
  }

  await supabase
    .from("quote_uploads")
    .update({ status: "applied" })
    .eq("id", upload.id);
  await supabase
    .from("ai_jobs")
    .update({ status: "applied", updated_at: new Date().toISOString() })
    .eq("id", jobId);

  return NextResponse.json({ ok: true });
}
