"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PriceSource } from "@/lib/types";

export function PriceSourceManager({
  initialSources,
}: {
  initialSources: PriceSource[];
}) {
  const router = useRouter();
  const [sources, setSources] = useState(initialSources);
  const [message, setMessage] = useState<string | null>(null);

  async function toggle(id: string, enabled: boolean) {
    const res = await fetch("/api/price-sources", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Update failed");
      return;
    }
    setSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled } : s)),
    );
    router.refresh();
  }

  async function saveTemplate(id: string, template: string) {
    const res = await fetch("/api/price-sources", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, search_url_template: template || null }),
    });
    const data = await res.json();
    setMessage(res.ok ? "Saved" : data.error || "Save failed");
    router.refresh();
  }

  return (
    <div className="stack">
      {message ? <p className="muted">{message}</p> : null}
      <div className="table-wrap panel-light">
        <table className="bom-table">
          <thead>
            <tr>
              <th>Enabled</th>
              <th>Name</th>
              <th>Domain</th>
              <th>Search template</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={source.enabled}
                    onChange={(e) => toggle(source.id, e.target.checked)}
                  />
                </td>
                <td>{source.name}</td>
                <td>{source.base_domain}</td>
                <td style={{ minWidth: 280 }}>
                  <input
                    className="field-light"
                    defaultValue={source.search_url_template ?? ""}
                    placeholder={
                      source.supports_search
                        ? "https://example.com/search?q={query}"
                        : "Search disabled — paste URL only"
                    }
                    onBlur={(e) => saveTemplate(source.id, e.target.value)}
                  />
                </td>
                <td>{source.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
