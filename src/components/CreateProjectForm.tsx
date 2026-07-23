"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function CreateProjectForm({
  clients,
  templates,
}: {
  clients: { id: string; name: string }[];
  templates: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_number: form.get("project_number"),
        name: form.get("name"),
        client_id: form.get("client_id") || null,
        template_id: form.get("template_id") || null,
        default_override_pct: Number(form.get("default_override_pct") || 0) / 100,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Failed to create project");
      return;
    }
    router.push(`/projects/${data.id}`);
    router.refresh();
  }

  return (
    <form className="panel" style={{ padding: "1rem" }} onSubmit={onSubmit}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: "0.65rem",
        }}
      >
        <div>
          <label className="label">Project #</label>
          <input className="field" name="project_number" required placeholder="Project #" />
        </div>
        <div>
          <label className="label">Name</label>
          <input className="field" name="name" required placeholder="Client / room" />
        </div>
        <div>
          <label className="label">Client</label>
          <select className="field" name="client_id" defaultValue="">
            <option value="">—</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">From template</label>
          <select className="field" name="template_id" defaultValue="">
            <option value="">Blank</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Default override %</label>
          <input
            className="field"
            name="default_override_pct"
            type="number"
            step="0.01"
            defaultValue={10}
          />
        </div>
      </div>
      <div className="row" style={{ marginTop: "0.75rem" }}>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Creating…" : "Create project"}
        </button>
        {error ? <span style={{ color: "var(--danger)" }}>{error}</span> : null}
      </div>
    </form>
  );
}
