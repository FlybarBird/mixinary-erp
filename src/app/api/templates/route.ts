import { NextResponse } from "next/server";
import { canEditPricing, getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_templates")
    .select("id, name, description, default_override_pct, created_at")
    .order("name");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canEditPricing(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim() || "New template";
  const description = String(body.description || "").trim() || null;
  const defaultOverridePct = Number(body.default_override_pct ?? 0);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_templates")
    .insert({
      name,
      description,
      default_override_pct: Number.isFinite(defaultOverridePct)
        ? defaultOverridePct
        : 0,
    })
    .select("id, name, description, default_override_pct")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Failed to create template" },
      { status: 400 },
    );
  }

  await supabase.from("template_sections").insert({
    template_id: data.id,
    name: "Hardware",
    sort_order: 0,
  });

  return NextResponse.json({ data });
}
