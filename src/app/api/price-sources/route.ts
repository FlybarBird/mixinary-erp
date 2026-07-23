import { NextResponse } from "next/server";
import { canManageAdmin, getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canManageAdmin(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const supabase = await createClient();
  const patch: Record<string, unknown> = {};
  if (body.enabled != null) patch.enabled = body.enabled;
  if ("search_url_template" in body) {
    patch.search_url_template = body.search_url_template || null;
  }
  const { error } = await supabase
    .from("price_sources")
    .update(patch)
    .eq("id", String(body.id));
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
