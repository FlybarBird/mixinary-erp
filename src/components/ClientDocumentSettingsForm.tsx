"use client";

import { FormEvent, useState } from "react";
import type { CompanySettings } from "@/lib/types";

export function ClientDocumentSettingsForm({
  initialSettings,
}: {
  initialSettings: CompanySettings;
}) {
  const [form, setForm] = useState({
    client_documents_enabled: initialSettings.client_documents_enabled,
    legal_name: initialSettings.legal_name ?? "",
    address: initialSettings.address ?? "",
    contact_email: initialSettings.contact_email ?? "",
    contact_phone: initialSettings.contact_phone ?? "",
    tax_id: initialSettings.tax_id ?? "",
    logo_path: initialSettings.logo_path ?? "",
    brand_color_primary: initialSettings.brand_color_primary,
    brand_color_accent: initialSettings.brand_color_accent,
    default_terms: initialSettings.default_terms ?? "",
    default_payment_instructions:
      initialSettings.default_payment_instructions ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/admin/client-documents", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage(data.error || "Save failed");
      return;
    }
    setMessage("Saved");
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <div className="table-wrap panel-light" style={{ padding: "1rem" }}>
        <label
          className="row"
          style={{ gap: "0.6rem", alignItems: "center", fontWeight: 650 }}
        >
          <input
            type="checkbox"
            checked={form.client_documents_enabled}
            onChange={(e) => set("client_documents_enabled", e.target.checked)}
          />
          Enable the Client Documents add-on
        </label>
        <p className="muted" style={{ margin: "0.5rem 0 0" }}>
          Adds a Client Documents tab to every project for building proposals
          and quotes that customers review, sign, and download from a secure
          link. Disabling hides the tab without deleting any documents.
        </p>
      </div>

      <div className="table-wrap panel-light" style={{ padding: "1rem" }}>
        <h2 className="page-sub" style={{ fontWeight: 650, marginTop: 0 }}>
          Company identity
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "0.75rem",
          }}
        >
          <div>
            <label className="label">Legal company name</label>
            <input
              className="field-light"
              value={form.legal_name}
              onChange={(e) => set("legal_name", e.target.value)}
              placeholder="Mixinary LLC"
            />
          </div>
          <div>
            <label className="label">Tax ID</label>
            <input
              className="field-light"
              value={form.tax_id}
              onChange={(e) => set("tax_id", e.target.value)}
              placeholder="EIN / VAT"
            />
          </div>
          <div>
            <label className="label">Contact email</label>
            <input
              className="field-light"
              type="email"
              value={form.contact_email}
              onChange={(e) => set("contact_email", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Contact phone</label>
            <input
              className="field-light"
              value={form.contact_phone}
              onChange={(e) => set("contact_phone", e.target.value)}
            />
          </div>
        </div>
        <div style={{ marginTop: "0.75rem" }}>
          <label className="label">Company address</label>
          <textarea
            className="field-light"
            rows={2}
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
          />
        </div>
      </div>

      <div className="table-wrap panel-light" style={{ padding: "1rem" }}>
        <h2 className="page-sub" style={{ fontWeight: 650, marginTop: 0 }}>
          Branding
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "0.75rem",
          }}
        >
          <div>
            <label className="label">Logo URL or path</label>
            <input
              className="field-light"
              value={form.logo_path}
              onChange={(e) => set("logo_path", e.target.value)}
              placeholder="/brand/logo-1.png or https://…"
            />
          </div>
          <div>
            <label className="label">Primary color</label>
            <div className="row" style={{ gap: "0.5rem" }}>
              <input
                type="color"
                value={form.brand_color_primary}
                onChange={(e) => set("brand_color_primary", e.target.value)}
                style={{ width: 42, height: 32, padding: 2 }}
              />
              <input
                className="field-light"
                value={form.brand_color_primary}
                onChange={(e) => set("brand_color_primary", e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label">Accent color</label>
            <div className="row" style={{ gap: "0.5rem" }}>
              <input
                type="color"
                value={form.brand_color_accent}
                onChange={(e) => set("brand_color_accent", e.target.value)}
                style={{ width: 42, height: 32, padding: 2 }}
              />
              <input
                className="field-light"
                value={form.brand_color_accent}
                onChange={(e) => set("brand_color_accent", e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="table-wrap panel-light" style={{ padding: "1rem" }}>
        <h2 className="page-sub" style={{ fontWeight: 650, marginTop: 0 }}>
          Document defaults
        </h2>
        <div>
          <label className="label">Default terms &amp; conditions</label>
          <textarea
            className="field-light"
            rows={5}
            value={form.default_terms}
            onChange={(e) => set("default_terms", e.target.value)}
            placeholder="Standard legal language inserted into new Terms blocks."
          />
        </div>
        <div style={{ marginTop: "0.75rem" }}>
          <label className="label">Default payment instructions</label>
          <textarea
            className="field-light"
            rows={4}
            value={form.default_payment_instructions}
            onChange={(e) =>
              set("default_payment_instructions", e.target.value)
            }
            placeholder="Check / ACH details shown on Payment Instructions blocks."
          />
        </div>
      </div>

      <div className="row" style={{ gap: "0.75rem", alignItems: "center" }}>
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
        {message ? <span className="muted">{message}</span> : null}
      </div>
    </form>
  );
}
