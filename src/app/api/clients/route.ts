import { NextResponse } from "next/server";
import { canManageClients, getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function cleanText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function parseActive(value: unknown, fallback = true): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const s = String(value).toLowerCase();
  if (s === "false" || s === "0" || s === "no") return false;
  return true;
}

function clientPayload(body: Record<string, unknown>, requireName: boolean) {
  const name = cleanText(body.name);
  if (requireName && !name) {
    return { error: "Name is required" as const };
  }
  return {
    name: name ?? undefined,
    code: cleanText(body.code),
    contact_name: cleanText(body.contact_name),
    email: cleanText(body.email),
    phone: cleanText(body.phone),
    website: cleanText(body.website),
    address_line1: cleanText(body.address_line1),
    address_line2: cleanText(body.address_line2),
    city: cleanText(body.city),
    state: cleanText(body.state),
    postal_code: cleanText(body.postal_code),
    notes: cleanText(body.notes),
    active: parseActive(body.active, true),
  };
}

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("name");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canManageClients(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await request.json()) as Record<string, unknown>;
  const payload = clientPayload(body, true);
  if ("error" in payload) {
    return NextResponse.json({ error: payload.error }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({
      name: payload.name!,
      code: payload.code,
      contact_name: payload.contact_name,
      email: payload.email,
      phone: payload.phone,
      website: payload.website,
      address_line1: payload.address_line1,
      address_line2: payload.address_line2,
      city: payload.city,
      state: payload.state,
      postal_code: payload.postal_code,
      notes: payload.notes,
      active: payload.active,
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
  if (!profile || !canManageClients(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await request.json()) as Record<string, unknown>;
  const id = String(body.id || "").trim();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const payload = clientPayload(body, true);
  if ("error" in payload) {
    return NextResponse.json({ error: payload.error }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .update({
      name: payload.name!,
      code: payload.code,
      contact_name: payload.contact_name,
      email: payload.email,
      phone: payload.phone,
      website: payload.website,
      address_line1: payload.address_line1,
      address_line2: payload.address_line2,
      city: payload.city,
      state: payload.state,
      postal_code: payload.postal_code,
      notes: payload.notes,
      active: payload.active,
      updated_at: new Date().toISOString(),
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
  if (!profile || !canManageClients(profile.role)) {
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

  // Unlink projects so delete isn't blocked (FK may be SET NULL or RESTRICT)
  await supabase.from("projects").update({ client_id: null }).eq("client_id", id);

  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
