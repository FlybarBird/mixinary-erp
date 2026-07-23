"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ProjectTemplate } from "@/lib/types";

export function TemplateList({
  initialTemplates,
  canEdit,
}: {
  initialTemplates: ProjectTemplate[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTemplates(initialTemplates);
  }, [initialTemplates]);

  async function createTemplate() {
    if (!canEdit || busy) return;
    const name = window.prompt("Template name", "New template");
    if (!name?.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Failed to create template");
      return;
    }
    router.push(`/templates/${data.data.id}`);
    router.refresh();
  }

  async function removeTemplate(template: ProjectTemplate) {
    if (!canEdit || busy) return;
    const ok = window.confirm(
      `Delete template “${template.name}”? This cannot be undone.`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/templates/${template.id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Failed to delete template");
      return;
    }
    setTemplates((prev) => prev.filter((t) => t.id !== template.id));
    router.refresh();
  }

  return (
    <div className="stack">
      {canEdit ? (
        <div className="row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void createTemplate()}
          >
            New template
          </button>
          {error ? (
            <span style={{ color: "var(--danger)" }}>{error}</span>
          ) : null}
        </div>
      ) : null}

      <div className="table-wrap panel-light">
        <table className="bom-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Default %</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{t.description || "—"}</td>
                <td>{(Number(t.default_override_pct) * 100).toFixed(2)}%</td>
                <td>
                  <div className="row" style={{ gap: "0.5rem" }}>
                    <Link
                      href={`/templates/${t.id}`}
                      style={{ color: "#0176d3" }}
                    >
                      {canEdit ? "Edit" : "View"}
                    </Link>
                    <Link
                      href={`/projects?template=${t.id}`}
                      style={{ color: "#0176d3" }}
                    >
                      Use in new project
                    </Link>
                    {canEdit ? (
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() => void removeTemplate(t)}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {!templates.length ? (
              <tr>
                <td colSpan={4}>
                  No templates yet.{" "}
                  {canEdit
                    ? "Create one, or import the master workbook from Admin → Excel Import."
                    : "Ask an admin or estimator to create one."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
