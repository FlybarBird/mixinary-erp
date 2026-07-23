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
  const acceptedIds = new Set((body.acceptedResultIds ?? []) as string[]);

  const supabase = await createClient();
  const { data: results } = await supabase
    .from("price_fetch_results")
    .select("*")
    .eq("job_id", jobId);

  for (const result of results ?? []) {
    const accepted = acceptedIds.has(result.id) && result.msrp != null;
    await supabase
      .from("price_fetch_results")
      .update({ accepted })
      .eq("id", result.id);

    if (accepted && result.line_item_id) {
      await supabase
        .from("line_items")
        .update({
          msrp: result.msrp,
          msrp_source_url: result.source_url,
          msrp_fetched_at: new Date().toISOString(),
          fetch_error: null,
          sku: result.sku || undefined,
        })
        .eq("id", result.line_item_id);
    }
  }

  await supabase
    .from("ai_jobs")
    .update({
      status: "applied",
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  return NextResponse.json({ ok: true });
}
