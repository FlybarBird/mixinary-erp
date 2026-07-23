import { NextResponse } from "next/server";
import { canEditPricing, getCurrentProfile } from "@/lib/auth";
import { getLocalDb, isLocalMode, newId } from "@/lib/local/db";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const category = searchParams.get("category");
  const company = searchParams.get("company");
  const activeOnly = searchParams.get("active") !== "0";

  if (isLocalMode()) {
    const db = getLocalDb();
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (activeOnly) clauses.push("p.active = 1");
    if (category) {
      clauses.push("p.category_id = ?");
      params.push(category);
    }
    if (company) {
      clauses.push("p.company_id = ?");
      params.push(company);
    }
    if (q) {
      clauses.push(
        "(lower(p.name) like lower(?) or lower(coalesce(p.sku,'')) like lower(?) or lower(coalesce(p.description,'')) like lower(?))",
      );
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
    const rows = db
      .prepare(
        `select p.*,
          c.name as category_name,
          co.name as company_name,
          v.code as vendor_code
         from catalog_parts p
         left join part_categories c on c.id = p.category_id
         left join part_companies co on co.id = p.company_id
         left join vendors v on v.id = p.default_vendor_id
         ${where}
         order by p.name
         limit 200`,
      )
      .all(...params) as Array<Record<string, unknown>>;

    return NextResponse.json({
      data: rows.map((row) => ({
        ...row,
        active: Boolean(row.active),
        specs:
          typeof row.specs === "string" && row.specs
            ? JSON.parse(String(row.specs))
            : row.specs,
        part_categories: row.category_name
          ? { id: row.category_id, name: row.category_name }
          : null,
        part_companies: row.company_name
          ? { id: row.company_id, name: row.company_name }
          : null,
        vendors: row.vendor_code
          ? { id: row.default_vendor_id, code: row.vendor_code }
          : null,
      })),
    });
  }

  const supabase = await createClient();
  let query = supabase
    .from("catalog_parts")
    .select(
      "*, part_categories(id, name), part_companies(id, name), vendors(id, code, name)",
    )
    .order("name")
    .limit(200);
  if (activeOnly) query = query.eq("active", true);
  if (category) query = query.eq("category_id", category);
  if (company) query = query.eq("company_id", company);
  if (q) {
    query = query.or(
      `name.ilike.%${q}%,sku.ilike.%${q}%,description.ilike.%${q}%`,
    );
  }
  const { data, error } = await query;
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
  const payload = {
    id: newId(),
    sku: body.sku || null,
    upc: body.upc || null,
    name: String(body.name || "").trim(),
    description: body.description || null,
    category_id: body.category_id || null,
    company_id: body.company_id || null,
    default_vendor_id: body.default_vendor_id || null,
    msrp: Number(body.msrp ?? 0),
    default_quote:
      body.default_quote == null || body.default_quote === ""
        ? null
        : Number(body.default_quote),
    image_path: body.image_path || null,
    image_url: body.image_url || null,
    specs: body.specs ?? null,
    source: body.source || "manual",
    active: body.active !== false,
  };

  if (!payload.name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalog_parts")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data });
}

export async function PATCH(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canEditPricing(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const id = String(body.id || "");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  for (const key of [
    "sku",
    "upc",
    "name",
    "description",
    "category_id",
    "company_id",
    "default_vendor_id",
    "msrp",
    "default_quote",
    "image_path",
    "image_url",
    "specs",
    "source",
    "active",
  ]) {
    if (key in body) patch[key] = body[key];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalog_parts")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data });
}

export async function DELETE(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canEditPricing(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const supabase = await createClient();
  // Soft-delete by default
  const { error } = await supabase
    .from("catalog_parts")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
