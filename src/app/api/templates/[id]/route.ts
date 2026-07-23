import { NextResponse } from "next/server";
import { canEditPricing, getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const { data: template, error } = await supabase
    .from("project_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !template) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [{ data: sections }, { data: lines }] = await Promise.all([
    supabase
      .from("template_sections")
      .select("*")
      .eq("template_id", id)
      .order("sort_order"),
    supabase
      .from("template_line_items")
      .select("*")
      .eq("template_id", id)
      .order("sort_order"),
  ]);

  return NextResponse.json({
    data: {
      template,
      sections: sections ?? [],
      lines: lines ?? [],
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile || !canEditPricing(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const patch: Record<string, unknown> = {};
  if ("name" in body) {
    const name = String(body.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    patch.name = name;
  }
  if ("description" in body) {
    const description = String(body.description || "").trim();
    patch.description = description || null;
  }
  if ("default_override_pct" in body) {
    const value = Number(body.default_override_pct);
    patch.default_override_pct = Number.isFinite(value) ? value : 0;
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "No changes" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_templates")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile || !canEditPricing(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_templates")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
