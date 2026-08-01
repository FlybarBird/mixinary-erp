import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { canManageAdmin } from "@/lib/permissions";
import {
  getCompanySettings,
  updateCompanySettings,
} from "@/lib/company-settings";
import { normalizeLabelPrinterBrand } from "@/lib/labels/rows";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageAdmin(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const settings = await getCompanySettings();
  return NextResponse.json({
    settings: { label_printer: settings.label_printer },
  });
}

export async function PUT(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageAdmin(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as { label_printer?: unknown };
  const label_printer = normalizeLabelPrinterBrand(body.label_printer);
  const settings = await updateCompanySettings({ label_printer });
  return NextResponse.json({
    settings: { label_printer: settings.label_printer },
  });
}
