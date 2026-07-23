import { NextResponse } from "next/server";
import { canEditPricing, getCurrentProfile } from "@/lib/auth";
import { newId } from "@/lib/local/db";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("part_categories")
    .select("*")
    .order("sort_order");
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
  const body = await request.json();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("part_categories")
    .insert({
      id: newId(),
      name: String(body.name || "").trim(),
      parent_id: body.parent_id || null,
      sort_order: Number(body.sort_order ?? 0),
    })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data });
}
