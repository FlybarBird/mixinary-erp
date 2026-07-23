"use client";

import { useState } from "react";

export function ExcelImportForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onUpload(file: File | null) {
    if (!file) return;
    setLoading(true);
    setMessage("Importing…");
    const form = new FormData();
    form.set("file", file);
    const res = await fetch("/api/import/excel", {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(data.error || "Import failed");
      return;
    }
    setMessage(
      `Imported ${data.projectsCreated} projects (${data.projectsSkipped} skipped), ${data.templatesCreated} templates, ${data.carriersUpserted} carriers.`,
    );
  }

  return (
    <div className="panel" style={{ padding: "1.25rem" }}>
      <label className="btn btn-primary">
        {loading ? "Working…" : "Choose .xlsx file"}
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          disabled={loading}
          onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
        />
      </label>
      {message ? <p className="muted">{message}</p> : null}
      <p className="muted" style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
        Existing project numbers are skipped. Templates are created only if the
        name does not already exist.
      </p>
    </div>
  );
}
