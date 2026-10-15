import { NextResponse } from "next/server";
import { canEditPricing, getCurrentProfile } from "@/lib/auth";
import { getLocalDb, isLocalMode } from "@/lib/local/db";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canEditPricing(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get("id")?.trim() || "";
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  if (isLocalMode()) {
    const db = getLocalDb();
    const uploads = db
      .prepare("select id from quote_uploads where job_id = ?")
      .all(id) as Array<{ id: string }>;
    const deleteLines = db.prepare(
      "delete from quote_extracted_lines where upload_id = ?",
    );
    for (const upload of uploads) deleteLines.run(upload.id);
    db.prepare("delete from quote_uploads where job_id = ?").run(id);
    db.prepare("delete from price_fetch_results where job_id = ?").run(id);
    db.prepare("delete from catalog_part_proposals where job_id = ?").run(id);
    const result = db.prepare("delete from ai_jobs where id = ?").run(id);
    if (!result.changes) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("ai_jobs")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  const { error } = await supabase.from("ai_jobs").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
