"use client";

import { FormEvent, useEffect, useState } from "react";

type MailProviderPreference = "auto" | "resend" | "smtp";

type SettingsFields = {
  provider: MailProviderPreference;
  brandName: string;
  poOrderCc: string;
  resendFrom: string;
  resendApiKeyMasked: string | null;
  resendApiKeySource: "settings" | "env" | null;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassMasked: string | null;
  smtpPassSource: "settings" | "env" | null;
  smtpFrom: string;
  smtpSecure: boolean;
};

type Status = {
  configured: boolean;
  provider: "resend" | "smtp" | null;
  providerPreference: MailProviderPreference;
  resend: boolean;
  smtp: boolean;
  from: string | null;
  brand: string;
  localMode: boolean;
  source: "settings" | "env" | null;
  settings: SettingsFields;
};

const emptyForm = {
  provider: "auto" as MailProviderPreference,
  brandName: "",
  poOrderCc: "",
  resendApiKey: "",
  resendFrom: "",
  smtpHost: "",
  smtpPort: "587",
  smtpUser: "",
  smtpPass: "",
  smtpFrom: "",
  smtpSecure: false,
};

export function EmailSettingsForm() {
  const [status, setStatus] = useState<Status | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [testTo, setTestTo] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  function applyStatus(data: Status) {
    setStatus(data);
    const s = data.settings;
    setForm({
      provider: s.provider || "auto",
      brandName: s.brandName || "",
      poOrderCc: s.poOrderCc || "",
      resendApiKey: "",
      resendFrom: s.resendFrom || "",
      smtpHost: s.smtpHost || "",
      smtpPort: s.smtpPort || "587",
      smtpUser: s.smtpUser || "",
      smtpPass: "",
      smtpFrom: s.smtpFrom || "",
      smtpSecure: Boolean(s.smtpSecure),
    });
  }

  async function load() {
    const res = await fetch("/api/admin/email");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to load settings");
      return;
    }
    applyStatus(data);
  }

  useEffect(() => {
    void load();
  }, []);

  function setField<K extends keyof typeof emptyForm>(
    key: K,
    value: (typeof emptyForm)[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save",
        provider: form.provider,
        brandName: form.brandName,
        poOrderCc: form.poOrderCc,
        resendApiKey: form.resendApiKey,
        resendFrom: form.resendFrom,
        smtpHost: form.smtpHost,
        smtpPort: form.smtpPort,
        smtpUser: form.smtpUser,
        smtpPass: form.smtpPass,
        smtpFrom: form.smtpFrom,
        smtpSecure: form.smtpSecure,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Save failed");
      return;
    }
    setMessage("Email settings saved");
    applyStatus(data);
  }

  async function onClear() {
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear" }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Clear failed");
      return;
    }
    setMessage("Cleared saved email settings (env vars still apply if set)");
    applyStatus(data);
  }

  async function onTest(e: FormEvent) {
    e.preventDefault();
    setTesting(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test", to: testTo }),
    });
    const data = await res.json();
    setTesting(false);
    if (!res.ok) {
      setError(data.error || "Send failed");
      return;
    }
    setMessage(`Test email sent via ${data.provider} to ${data.to}`);
  }

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      {error ? (
        <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>
      ) : null}
      {message ? <p className="muted" style={{ margin: 0 }}>{message}</p> : null}

      <div className="panel" style={{ padding: "1rem" }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>
          Provider status
        </h2>
        {status ? (
          <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
            <li>
              Active:{" "}
              <strong>
                {status.configured
                  ? status.provider === "resend"
                    ? "Resend"
                    : "SMTP"
                  : "Not configured"}
              </strong>
              {status.source ? ` · ${status.source}` : ""}
            </li>
            <li>Resend: {status.resend ? "ready" : "missing"}</li>
            <li>SMTP: {status.smtp ? "ready" : "missing"}</li>
            <li>From: {status.from || "—"}</li>
            <li>Brand: {status.brand}</li>
          </ul>
        ) : (
          <p className="muted">Loading…</p>
        )}
        <p className="muted" style={{ marginBottom: 0, marginTop: "0.85rem" }}>
          In local mode, saved settings take priority over env vars. Prefer
          Resend with auto preference; SMTP is the fallback. Without either,
          Admin → Users shows a copyable invite link.
        </p>
      </div>

      {status?.localMode ? (
        <form className="panel stack" style={{ padding: "1rem" }} onSubmit={onSave}>
          <h2 className="section-title" style={{ marginTop: 0 }}>
            Email settings
          </h2>

          <div>
            <label className="label" htmlFor="provider">
              Provider preference
            </label>
            <select
              id="provider"
              className="field"
              value={form.provider}
              onChange={(e) =>
                setField("provider", e.target.value as MailProviderPreference)
              }
            >
              <option value="auto">Auto (Resend, then SMTP)</option>
              <option value="resend">Resend only</option>
              <option value="smtp">SMTP only</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="brandName">
              Brand name (optional)
            </label>
            <input
              id="brandName"
              className="field"
              value={form.brandName}
              onChange={(e) => setField("brandName", e.target.value)}
              placeholder="Mixinary ERP"
            />
          </div>

          <div>
            <label className="label" htmlFor="poOrderCc">
              PO order email CC (global)
            </label>
            <input
              id="poOrderCc"
              className="field"
              type="email"
              value={form.poOrderCc}
              onChange={(e) => setField("poOrderCc", e.target.value)}
              placeholder="purchasing@yourcompany.com"
            />
            <p className="muted" style={{ marginBottom: 0, marginTop: "0.35rem" }}>
              Added as CC on every procurement Email link. Cloud: set{" "}
              <code>PO_ORDER_EMAIL_CC</code> instead.
            </p>
          </div>

          <h3 className="section-title" style={{ fontSize: "0.95rem" }}>
            Resend
          </h3>
          <div>
            <label className="label" htmlFor="resendApiKey">
              API key
              {status.settings.resendApiKeyMasked ? (
                <span className="muted">
                  {" "}
                  · current {status.settings.resendApiKeyMasked}
                  {status.settings.resendApiKeySource
                    ? ` (${status.settings.resendApiKeySource})`
                    : ""}
                </span>
              ) : null}
            </label>
            <input
              id="resendApiKey"
              className="field"
              type="password"
              autoComplete="off"
              value={form.resendApiKey}
              onChange={(e) => setField("resendApiKey", e.target.value)}
              placeholder={
                status.settings.resendApiKeyMasked
                  ? "Leave blank to keep current"
                  : "re_..."
              }
            />
          </div>
          <div>
            <label className="label" htmlFor="resendFrom">
              From address
            </label>
            <input
              id="resendFrom"
              className="field"
              type="text"
              value={form.resendFrom}
              onChange={(e) => setField("resendFrom", e.target.value)}
              placeholder="Mixinary <noreply@yourdomain.com>"
            />
          </div>

          <h3 className="section-title" style={{ fontSize: "0.95rem" }}>
            SMTP
          </h3>
          <div className="row" style={{ gap: "0.75rem", flexWrap: "wrap" }}>
            <div style={{ flex: 2, minWidth: 180 }}>
              <label className="label" htmlFor="smtpHost">
                Host
              </label>
              <input
                id="smtpHost"
                className="field"
                value={form.smtpHost}
                onChange={(e) => setField("smtpHost", e.target.value)}
                placeholder="smtp.example.com"
              />
            </div>
            <div style={{ flex: 1, minWidth: 100 }}>
              <label className="label" htmlFor="smtpPort">
                Port
              </label>
              <input
                id="smtpPort"
                className="field"
                value={form.smtpPort}
                onChange={(e) => setField("smtpPort", e.target.value)}
                placeholder="587"
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="smtpUser">
              Username
            </label>
            <input
              id="smtpUser"
              className="field"
              value={form.smtpUser}
              onChange={(e) => setField("smtpUser", e.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="label" htmlFor="smtpPass">
              Password
              {status.settings.smtpPassMasked ? (
                <span className="muted">
                  {" "}
                  · current {status.settings.smtpPassMasked}
                  {status.settings.smtpPassSource
                    ? ` (${status.settings.smtpPassSource})`
                    : ""}
                </span>
              ) : null}
            </label>
            <input
              id="smtpPass"
              className="field"
              type="password"
              autoComplete="off"
              value={form.smtpPass}
              onChange={(e) => setField("smtpPass", e.target.value)}
              placeholder={
                status.settings.smtpPassMasked
                  ? "Leave blank to keep current"
                  : ""
              }
            />
          </div>
          <div>
            <label className="label" htmlFor="smtpFrom">
              From address
            </label>
            <input
              id="smtpFrom"
              className="field"
              value={form.smtpFrom}
              onChange={(e) => setField("smtpFrom", e.target.value)}
              placeholder="noreply@yourdomain.com"
            />
          </div>
          <label
            className="row"
            style={{ gap: "0.5rem", alignItems: "center", cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={form.smtpSecure}
              onChange={(e) => setField("smtpSecure", e.target.checked)}
            />
            <span>Use TLS/SSL (SMTP_SECURE)</span>
          </label>

          <div className="row" style={{ gap: "0.75rem", flexWrap: "wrap" }}>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save settings"}
            </button>
            {status.source === "settings" ? (
              <button
                className="btn"
                type="button"
                disabled={saving}
                onClick={() => void onClear()}
              >
                Clear saved
              </button>
            ) : null}
          </div>
        </form>
      ) : status ? (
        <div className="panel" style={{ padding: "1rem" }}>
          <h2 className="section-title" style={{ marginTop: 0 }}>
            Email settings
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            Cloud mode: set <code>RESEND_API_KEY</code> +{" "}
            <code>RESEND_FROM</code> (or <code>SMTP_*</code>) in your host
            environment and restart. Saving secrets from this UI is only
            available in local mode.
          </p>
        </div>
      ) : null}

      <form className="panel stack" style={{ padding: "1rem" }} onSubmit={onTest}>
        <h2 className="section-title" style={{ marginTop: 0 }}>
          Send test email
        </h2>
        <div>
          <label className="label" htmlFor="to">
            Recipient
          </label>
          <input
            id="to"
            className="field"
            name="to"
            type="email"
            required
            placeholder="you@mixinary.com"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
          />
        </div>
        <button
          className="btn btn-primary"
          type="submit"
          disabled={testing || !status?.configured}
        >
          {testing ? "Sending…" : "Send test"}
        </button>
      </form>
    </div>
  );
}
