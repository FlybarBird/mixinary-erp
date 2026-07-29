import nodemailer from "nodemailer";
import { Resend } from "resend";
import { getLocalDb, isLocalMode } from "@/lib/local/db";

export type MailProvider = "resend" | "smtp" | null;
export type MailProviderPreference = "auto" | "resend" | "smtp";

export const EMAIL_SETTINGS_KEY = "email_settings";

export type StoredEmailSettings = {
  provider?: MailProviderPreference;
  brandName?: string;
  /** Global CC for procurement / PO order emails (mailto + future sends). */
  poOrderCc?: string;
  resendApiKey?: string;
  resendFrom?: string;
  smtpHost?: string;
  smtpPort?: string;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  smtpSecure?: boolean;
};

function appUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function trimOrEmpty(value: string | undefined | null) {
  return String(value ?? "").trim();
}

function firstNonEmpty(...values: Array<string | undefined | null>) {
  for (const value of values) {
    const trimmed = trimOrEmpty(value);
    if (trimmed) return trimmed;
  }
  return "";
}

export function getStoredEmailSettings(): StoredEmailSettings | null {
  if (!isLocalMode()) return null;
  try {
    const row = getLocalDb()
      .prepare("select value from app_settings where key = ?")
      .get(EMAIL_SETTINGS_KEY) as { value: string } | undefined;
    if (!row?.value) return null;
    const parsed = JSON.parse(row.value) as StoredEmailSettings;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function saveEmailSettings(settings: StoredEmailSettings) {
  if (!isLocalMode()) {
    throw new Error("Email settings can only be saved in local mode");
  }
  getLocalDb()
    .prepare(
      `insert into app_settings (key, value, updated_at)
       values (?, ?, datetime('now'))
       on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(EMAIL_SETTINGS_KEY, JSON.stringify(settings));
}

export function clearEmailSettings() {
  if (!isLocalMode()) {
    throw new Error("Email settings can only be cleared in local mode");
  }
  getLocalDb()
    .prepare("delete from app_settings where key = ?")
    .run(EMAIL_SETTINGS_KEY);
}

function stored(): StoredEmailSettings {
  return getStoredEmailSettings() || {};
}

function brandName() {
  return firstNonEmpty(stored().brandName, process.env.APP_BRAND_NAME) || "Mixinary ERP";
}

function resendApiKey() {
  return firstNonEmpty(stored().resendApiKey, process.env.RESEND_API_KEY);
}

function resendFrom() {
  return firstNonEmpty(
    stored().resendFrom,
    process.env.RESEND_FROM,
    stored().smtpFrom,
    process.env.SMTP_FROM,
  );
}

function smtpHost() {
  return firstNonEmpty(stored().smtpHost, process.env.SMTP_HOST);
}

function smtpPort() {
  return firstNonEmpty(stored().smtpPort, process.env.SMTP_PORT) || "587";
}

function smtpUser() {
  return firstNonEmpty(stored().smtpUser, process.env.SMTP_USER);
}

function smtpPass() {
  return firstNonEmpty(stored().smtpPass, process.env.SMTP_PASS);
}

function smtpFrom() {
  return firstNonEmpty(
    stored().smtpFrom,
    process.env.SMTP_FROM,
    stored().resendFrom,
    process.env.RESEND_FROM,
  );
}

function smtpSecure() {
  const s = stored();
  if (typeof s.smtpSecure === "boolean") return s.smtpSecure;
  return process.env.SMTP_SECURE === "true";
}

function providerPreference(): MailProviderPreference {
  const pref = stored().provider;
  if (pref === "resend" || pref === "smtp" || pref === "auto") return pref;
  return "auto";
}

export function resendConfigured() {
  return Boolean(resendApiKey() && resendFrom());
}

export function smtpConfigured() {
  return Boolean(smtpHost() && smtpFrom());
}

/** Shadow PMS–style: Resend primary, SMTP fallback (or forced preference). */
export function mailConfigured() {
  return resendConfigured() || smtpConfigured();
}

export function getMailProvider(): MailProvider {
  const pref = providerPreference();
  if (pref === "resend") return resendConfigured() ? "resend" : null;
  if (pref === "smtp") return smtpConfigured() ? "smtp" : null;
  if (resendConfigured()) return "resend";
  if (smtpConfigured()) return "smtp";
  return null;
}

function maskSecret(value: string | null | undefined) {
  const key = trimOrEmpty(value);
  if (!key) return null;
  if (key.length <= 12) return "••••••••";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function settingSource(
  storedValue: string | undefined | null,
  envValue: string | undefined | null,
): "settings" | "env" | null {
  if (trimOrEmpty(storedValue)) return "settings";
  if (trimOrEmpty(envValue)) return "env";
  return null;
}

export function looksLikeMaskedSecret(value: string | undefined | null) {
  const v = String(value ?? "");
  return !v.trim() || /[•…]/.test(v) || /\*{3,}/.test(v);
}

export function mergeEmailSettingsPatch(
  existing: StoredEmailSettings | null,
  patch: StoredEmailSettings,
): StoredEmailSettings {
  const base = existing || {};
  const next: StoredEmailSettings = { ...base };

  if (patch.provider === "auto" || patch.provider === "resend" || patch.provider === "smtp") {
    next.provider = patch.provider;
  }
  if (patch.brandName !== undefined) {
    next.brandName = trimOrEmpty(patch.brandName) || undefined;
  }
  if (patch.poOrderCc !== undefined) {
    next.poOrderCc = trimOrEmpty(patch.poOrderCc) || undefined;
  }
  if (patch.resendFrom !== undefined) {
    next.resendFrom = trimOrEmpty(patch.resendFrom) || undefined;
  }
  if (patch.smtpHost !== undefined) {
    next.smtpHost = trimOrEmpty(patch.smtpHost) || undefined;
  }
  if (patch.smtpPort !== undefined) {
    next.smtpPort = trimOrEmpty(patch.smtpPort) || undefined;
  }
  if (patch.smtpUser !== undefined) {
    next.smtpUser = trimOrEmpty(patch.smtpUser) || undefined;
  }
  if (patch.smtpFrom !== undefined) {
    next.smtpFrom = trimOrEmpty(patch.smtpFrom) || undefined;
  }
  if (typeof patch.smtpSecure === "boolean") {
    next.smtpSecure = patch.smtpSecure;
  }
  // Secrets: keep existing when blank / masked
  if (patch.resendApiKey !== undefined && !looksLikeMaskedSecret(patch.resendApiKey)) {
    next.resendApiKey = trimOrEmpty(patch.resendApiKey) || undefined;
  }
  if (patch.smtpPass !== undefined && !looksLikeMaskedSecret(patch.smtpPass)) {
    next.smtpPass = trimOrEmpty(patch.smtpPass) || undefined;
  }

  return next;
}

function brandedShell(opts: {
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}) {
  const brand = brandName();
  const cta =
    opts.ctaLabel && opts.ctaUrl
      ? `<p style="margin:0 0 24px">
      <a href="${opts.ctaUrl}" style="display:inline-block;background:#0070f2;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600">${opts.ctaLabel}</a>
    </p>
    <p style="margin:0 0 12px;font-size:12px;color:#556b82">If the button does not work, open this link:<br/>${opts.ctaUrl}</p>`
      : "";
  const footer = opts.footerNote
    ? `<p style="margin:16px 0 0;font-size:12px;color:#556b82">${opts.footerNote}</p>`
    : "";
  return `<!DOCTYPE html>
<html><body style="font-family:Segoe UI,sans-serif;background:#edf0f4;padding:24px;color:#223548">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;padding:28px;border:1px solid #d1dbe6">
    <h1 style="margin:0 0 4px;font-size:20px;color:#0070f2">${brand}</h1>
    <h2 style="margin:0 0 16px;font-size:16px;font-weight:600;color:#223548">${opts.title}</h2>
    ${opts.bodyHtml}
    ${cta}
    ${footer}
  </div>
</body></html>`;
}

export function inviteEmailHtml(opts: {
  inviteUrl: string;
  fullName?: string | null;
  roleLabel: string;
}) {
  const greeting = opts.fullName ? `Hi ${opts.fullName},` : "Hi,";
  return brandedShell({
    title: "You're invited",
    bodyHtml: `<p style="margin:0 0 12px">${greeting}</p>
    <p style="margin:0 0 16px">You have been invited to <strong>${brandName()}</strong> as <strong>${opts.roleLabel}</strong>. Click below to accept and set up your account.</p>`,
    ctaLabel: "Accept invitation",
    ctaUrl: opts.inviteUrl,
    footerNote: "This invite expires in 7 days.",
  });
}

export function projectMemberEmailHtml(opts: {
  projectLabel: string;
  accessLabel: string;
  projectUrl: string;
  inviterName?: string | null;
}) {
  const by = opts.inviterName ? ` by ${opts.inviterName}` : "";
  return brandedShell({
    title: "Project access granted",
    bodyHtml: `<p style="margin:0 0 16px">You have been added${by} to <strong>${opts.projectLabel}</strong> as <strong>${opts.accessLabel}</strong>.</p>`,
    ctaLabel: "Open project",
    ctaUrl: opts.projectUrl,
  });
}

export function notificationEmailHtml(opts: {
  title: string;
  message: string;
  actionLabel?: string;
  actionUrl?: string;
}) {
  return brandedShell({
    title: opts.title,
    bodyHtml: `<p style="margin:0 0 16px">${opts.message}</p>`,
    ctaLabel: opts.actionLabel,
    ctaUrl: opts.actionUrl,
  });
}

export function testEmailHtml() {
  return brandedShell({
    title: "Test email",
    bodyHtml: `<p style="margin:0 0 16px">Mixinary ERP mail is configured correctly. Provider: <strong>${getMailProvider() ?? "none"}</strong>.</p>`,
    footerNote: new Date().toISOString(),
  });
}

export async function sendBrandedEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<
  | { ok: true; provider: "resend" | "smtp" }
  | { ok: false; error: string }
> {
  const provider = getMailProvider();
  if (!provider) {
    return {
      ok: false,
      error:
        "Email is not configured. Set Resend or SMTP under Admin → Email (local mode), or via RESEND_* / SMTP_* env vars.",
    };
  }

  const text =
    opts.text ||
    opts.html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  if (provider === "resend") {
    try {
      const resend = new Resend(resendApiKey());
      const { error } = await resend.emails.send({
        from: resendFrom(),
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text,
      });
      if (error) {
        return { ok: false, error: error.message };
      }
      return { ok: true, provider: "resend" };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Resend send failed",
      };
    }
  }

  try {
    const user = smtpUser();
    const pass = smtpPass();
    const transporter = nodemailer.createTransport({
      host: smtpHost(),
      port: Number(smtpPort()),
      secure: smtpSecure(),
      auth: user || pass ? { user: user || "", pass: pass || "" } : undefined,
    });

    await transporter.sendMail({
      from: smtpFrom(),
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text,
    });
    return { ok: true, provider: "smtp" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "SMTP send failed",
    };
  }
}

export async function sendInviteEmail(opts: {
  to: string;
  inviteUrl: string;
  fullName?: string | null;
  roleLabel: string;
}) {
  return sendBrandedEmail({
    to: opts.to,
    subject: `You're invited to ${brandName()}`,
    html: inviteEmailHtml(opts),
  });
}

export async function sendProjectMemberEmail(opts: {
  to: string;
  projectLabel: string;
  accessLabel: string;
  projectId: string;
  inviterName?: string | null;
}) {
  return sendBrandedEmail({
    to: opts.to,
    subject: `Added to ${opts.projectLabel} — ${brandName()}`,
    html: projectMemberEmailHtml({
      ...opts,
      projectUrl: `${appUrl()}/projects/${opts.projectId}`,
    }),
  });
}

export async function sendNotificationEmail(opts: {
  to: string;
  title: string;
  message: string;
  actionLabel?: string;
  actionUrl?: string;
}) {
  return sendBrandedEmail({
    to: opts.to,
    subject: `${opts.title} — ${brandName()}`,
    html: notificationEmailHtml(opts),
  });
}

export async function sendTestEmail(to: string) {
  return sendBrandedEmail({
    to,
    subject: `${brandName()} test email`,
    html: testEmailHtml(),
  });
}

export function buildInviteUrl(token: string) {
  return `${appUrl()}/invite/${token}`;
}

/** Public customer link for a client document. */
export function buildClientDocumentUrl(token: string) {
  return `${appUrl()}/d/${token}`;
}

export function clientDocumentEmailHtml(opts: {
  documentName: string;
  documentTypeLabel: string;
  companyName?: string | null;
  message?: string | null;
  documentUrl: string;
  expiresAt?: string | null;
}) {
  const from = opts.companyName || brandName();
  const note = opts.message
    ? `<p style="margin:0 0 16px;white-space:pre-line">${opts.message}</p>`
    : "";
  const expiry = opts.expiresAt
    ? `This link expires on ${new Date(opts.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`
    : "The secure link stays available until access is revoked.";
  return brandedShell({
    title: `${opts.documentTypeLabel} from ${from}`,
    bodyHtml: `${note}<p style="margin:0 0 16px"><strong>${from}</strong> has shared <strong>${opts.documentName}</strong> with you. Open the secure link below to review, choose options, sign, or download a PDF — on any device.</p>`,
    ctaLabel: `Review ${opts.documentTypeLabel.toLowerCase()}`,
    ctaUrl: opts.documentUrl,
    footerNote: expiry,
  });
}

export async function sendClientDocumentEmail(opts: {
  to: string;
  documentName: string;
  documentTypeLabel: string;
  companyName?: string | null;
  message?: string | null;
  documentUrl: string;
  expiresAt?: string | null;
}) {
  return sendBrandedEmail({
    to: opts.to,
    subject: `${opts.documentTypeLabel}: ${opts.documentName} — ${
      opts.companyName || brandName()
    }`,
    html: clientDocumentEmailHtml(opts),
  });
}

export function buildAuthCallbackUrl() {
  return `${appUrl()}/auth/callback`;
}

export function buildResetRedirectUrl() {
  return `${appUrl()}/auth/reset`;
}

/** Global CC used on PO order emails (settings, then env). */
export function getPoOrderEmailCc() {
  return firstNonEmpty(
    stored().poOrderCc,
    process.env.PO_ORDER_EMAIL_CC,
    process.env.PROCUREMENT_EMAIL_CC,
  );
}

export function getMailStatus() {
  const s = stored();
  const hasStored = Boolean(getStoredEmailSettings());
  return {
    configured: mailConfigured(),
    provider: getMailProvider(),
    providerPreference: providerPreference(),
    resend: resendConfigured(),
    smtp: smtpConfigured(),
    from: resendConfigured()
      ? resendFrom()
      : smtpConfigured()
        ? smtpFrom()
        : null,
    brand: brandName(),
    localMode: isLocalMode(),
    source: hasStored ? "settings" : mailConfigured() ? "env" : null,
    settings: {
      provider: providerPreference(),
      brandName: firstNonEmpty(s.brandName, process.env.APP_BRAND_NAME) || "",
      poOrderCc: getPoOrderEmailCc(),
      resendFrom: firstNonEmpty(s.resendFrom, process.env.RESEND_FROM),
      resendApiKeyMasked: maskSecret(
        firstNonEmpty(s.resendApiKey, process.env.RESEND_API_KEY),
      ),
      resendApiKeySource: settingSource(s.resendApiKey, process.env.RESEND_API_KEY),
      smtpHost: firstNonEmpty(s.smtpHost, process.env.SMTP_HOST),
      smtpPort: firstNonEmpty(s.smtpPort, process.env.SMTP_PORT) || "587",
      smtpUser: firstNonEmpty(s.smtpUser, process.env.SMTP_USER),
      smtpPassMasked: maskSecret(
        firstNonEmpty(s.smtpPass, process.env.SMTP_PASS),
      ),
      smtpPassSource: settingSource(s.smtpPass, process.env.SMTP_PASS),
      smtpFrom: firstNonEmpty(s.smtpFrom, process.env.SMTP_FROM),
      smtpSecure: smtpSecure(),
    },
  };
}
