import { NextResponse } from "next/server";
import { canManageAdmin, getCurrentProfile } from "@/lib/auth";
import {
  clearEmailSettings,
  getMailStatus,
  getStoredEmailSettings,
  mergeEmailSettingsPatch,
  saveEmailSettings,
  sendTestEmail,
  type MailProviderPreference,
  type StoredEmailSettings,
} from "@/lib/email";
import { isLocalMode } from "@/lib/local/db";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || !canManageAdmin(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(getMailStatus());
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canManageAdmin(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "test");

  if (action === "test") {
    const to = String(body.to || profile.email || "").trim();
    if (!to.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }
    const result = await sendTestEmail(to);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, provider: result.provider, to });
  }

  if (!isLocalMode()) {
    return NextResponse.json(
      {
        error:
          "In cloud mode, set RESEND_* or SMTP_* in your host environment instead of saving them here.",
      },
      { status: 400 },
    );
  }

  if (action === "clear") {
    clearEmailSettings();
    return NextResponse.json({ ok: true, ...getMailStatus() });
  }

  if (action === "save") {
    const providerRaw = String(body.provider || "auto").trim();
    const provider: MailProviderPreference =
      providerRaw === "resend" || providerRaw === "smtp" || providerRaw === "auto"
        ? providerRaw
        : "auto";

    const patch: StoredEmailSettings = {
      provider,
      brandName: body.brandName != null ? String(body.brandName) : undefined,
      poOrderCc: body.poOrderCc != null ? String(body.poOrderCc) : undefined,
      resendApiKey:
        body.resendApiKey != null ? String(body.resendApiKey) : undefined,
      resendFrom: body.resendFrom != null ? String(body.resendFrom) : undefined,
      smtpHost: body.smtpHost != null ? String(body.smtpHost) : undefined,
      smtpPort: body.smtpPort != null ? String(body.smtpPort) : undefined,
      smtpUser: body.smtpUser != null ? String(body.smtpUser) : undefined,
      smtpPass: body.smtpPass != null ? String(body.smtpPass) : undefined,
      smtpFrom: body.smtpFrom != null ? String(body.smtpFrom) : undefined,
      smtpSecure:
        typeof body.smtpSecure === "boolean"
          ? body.smtpSecure
          : body.smtpSecure === "true" || body.smtpSecure === "1"
            ? true
            : body.smtpSecure === "false" || body.smtpSecure === "0"
              ? false
              : undefined,
    };

    const next = mergeEmailSettingsPatch(getStoredEmailSettings(), patch);
    saveEmailSettings(next);
    return NextResponse.json({ ok: true, ...getMailStatus() });
  }

  return NextResponse.json(
    { error: 'Unknown action. Use "test", "save", or "clear".' },
    { status: 400 },
  );
}
