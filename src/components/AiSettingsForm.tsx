"use client";

import { FormEvent, useEffect, useState } from "react";

export function AiSettingsForm() {
  const [configured, setConfigured] = useState(false);
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [localMode, setLocalMode] = useState(true);
  const [key, setKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/ai-settings");
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Failed to load settings");
      return;
    }
    setConfigured(Boolean(data.configured));
    setMaskedKey(data.maskedKey ?? null);
    setSource(data.source ?? null);
    setLocalMode(Boolean(data.localMode));
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/admin/ai-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openai_api_key: key }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(data.error || "Save failed");
      if (data.configured) await load();
      return;
    }
    setKey("");
    setMessage("Saved");
    await load();
  }

  async function onClear() {
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/admin/ai-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear" }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(data.error || "Clear failed");
      return;
    }
    setMessage("Cleared saved key");
    await load();
  }

  return (
    <div className="stack">
      {message ? <p className="muted">{message}</p> : null}

      <div className="table-wrap panel-light">
        <table className="bom-table">
          <thead>
            <tr>
              <th>Setting</th>
              <th>Status</th>
              <th>Value</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontWeight: 650 }}>OpenAI API key</td>
              <td>
                {configured ? (
                  <span className="badge" style={{ background: "rgba(46,132,74,0.12)", color: "var(--ok)" }}>
                    configured
                  </span>
                ) : (
                  <span className="badge" style={{ background: "rgba(186,5,23,0.1)", color: "var(--danger)" }}>
                    missing
                  </span>
                )}
              </td>
              <td style={{ minWidth: 280 }}>
                {configured ? (
                  <span className="muted">
                    {maskedKey}
                    {source ? ` · ${source}` : ""}
                  </span>
                ) : (
                  <span className="muted">Not set</span>
                )}
              </td>
              <td className="muted">
                Parts scrape, MSRP fetch, PDF quote AI
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {localMode ? (
        <form className="table-wrap panel-light" style={{ padding: "1rem" }} onSubmit={onSave}>
          <div className="row" style={{ alignItems: "end", gap: "0.75rem" }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <label className="label" htmlFor="openai-key">
                Paste OpenAI API key
              </label>
              <input
                id="openai-key"
                className="field-light"
                type="password"
                autoComplete="off"
                placeholder="sk-..."
                value={key}
                onChange={(e) => setKey(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Saving…" : "Save & verify"}
            </button>
            {configured && source === "settings" ? (
              <button
                className="btn"
                type="button"
                disabled={loading}
                onClick={() => void onClear()}
              >
                Clear
              </button>
            ) : null}
          </div>
        </form>
      ) : (
        <div className="table-wrap panel-light" style={{ padding: "1rem" }}>
          <p className="muted" style={{ margin: 0 }}>
            Cloud mode: set <code>OPENAI_API_KEY</code> in your host environment
            and restart.
          </p>
        </div>
      )}
    </div>
  );
}
