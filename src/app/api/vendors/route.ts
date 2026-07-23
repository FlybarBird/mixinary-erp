import { NextResponse } from "next/server";
import { canManageVendors, getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function cleanText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendors")
    .select("*")
    .order("code");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canManageVendors(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const code = cleanText(body.code);
  const name = cleanText(body.name);
  if (!code || !name) {
    return NextResponse.json(
      { error: "Code and name are required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendors")
    .insert({
      code,
      name,
      account_number: cleanText(body.account_number),
      notes: cleanText(body.notes),
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, data });
}

export async function PATCH(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canManageVendors(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const id = String(body.id || "").trim();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const code = cleanText(body.code);
  const name = cleanText(body.name);
  if (!code || !name) {
    return NextResponse.json(
      { error: "Code and name are required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendors")
    .update({
      code,
      name,
      account_number: cleanText(body.account_number),
      notes: cleanText(body.notes),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, data });
}

export async function DELETE(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canManageVendors(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  let id = url.searchParams.get("id") || "";
  if (!id) {
    try {
      const body = await request.json();
      id = String(body.id || "").trim();
    } catch {
      id = "";
    }
  }
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabase = await createClient();

  // Clear references so delete isn't blocked by FKs
  await supabase
    .from("line_items")
    .update({ vendor_id: null })
    .eq("vendor_id", id);
  await supabase
    .from("catalog_parts")
    .update({ default_vendor_id: null })
    .eq("default_vendor_id", id);

  const { error } = await supabase.from("vendors").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
