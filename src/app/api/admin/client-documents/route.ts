import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { canManageAdmin } from "@/lib/permissions";
import {
  getCompanySettings,
  updateCompanySettings,
} from "@/lib/company-settings";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageAdmin(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const settings = await getCompanySettings();
  return NextResponse.json({ settings });
}

export async function PUT(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageAdmin(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const text = (value: unknown) => {
    const s = String(value ?? "").trim();
    return s || null;
  };
  const color = (value: unknown, fallback: string) => {
    const s = String(value ?? "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(s) ? s : fallback;
  };

  const settings = await updateCompanySettings({
    client_documents_enabled: Boolean(body.client_documents_enabled),
    legal_name: text(body.legal_name),
    address: text(body.address),
    contact_email: text(body.contact_email),
    contact_phone: text(body.contact_phone),
    tax_id: text(body.tax_id),
    logo_path: text(body.logo_path),
    brand_color_primary: color(body.brand_color_primary, "#0070f2"),
    brand_color_accent: color(body.brand_color_accent, "#223548"),
    default_terms: text(body.default_terms),
    default_payment_instructions: text(body.default_payment_instructions),
  });

  return NextResponse.json({ settings });
}
