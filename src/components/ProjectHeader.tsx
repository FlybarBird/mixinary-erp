"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectStatus } from "@/lib/types";
import { OverflowMenu } from "@/components/OverflowMenu";
import { cn } from "@/lib/format";

const STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "complete", label: "Complete" },
  { value: "archived", label: "Archived" },
];

export function ProjectHeader({
  project,
  clients,
  managers,
  canEdit,
  canEditFinancials = false,
}: {
  project: {
    id: string;
    project_number: string;
    name: string;
    client_id: string | null;
    project_manager_id: string | null;
    material_budget: number | null;
    labor_budget: number | null;
    expense_budget: number | null;
    subcontractor_budget: number | null;
    overhead_budget: number | null;
    original_revenue: number | null;
    revenue_additions: number;
    revenue_credits: number;
    start_date: string | null;
    target_completion_date: string | null;
    percent_complete: number;
    status: ProjectStatus;
    default_override_pct: number;
    notes: string | null;
    client_name: string | null;
    project_manager_name: string | null;
  };
  clients: { id: string; name: string }[];
  managers: { id: string; name: string }[];
  canEdit: boolean;
  canEditFinancials?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Failed to update project");
      return false;
    }
    router.refresh();
    return true;
  }

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit) return;
    const form = new FormData(e.currentTarget);
    const numOrNull = (key: string) => {
      const raw = String(form.get(key) || "").trim();
      return raw === "" ? null : Number(raw);
    };
    const body: Record<string, unknown> = {
      project_number: form.get("project_number"),
      name: form.get("name"),
      client_id: form.get("client_id") || null,
      project_manager_id: form.get("project_manager_id") || null,
      status: form.get("status"),
      default_override_pct: Number(form.get("default_override_pct") || 0) / 100,
      start_date: form.get("start_date") || null,
      target_completion_date: form.get("target_completion_date") || null,
      percent_complete: Number(form.get("percent_complete") || 0),
      notes: form.get("notes") || null,
    };
    if (canEditFinancials) {
      body.material_budget = numOrNull("material_budget");
      body.labor_budget = numOrNull("labor_budget");
      body.expense_budget = numOrNull("expense_budget");
      body.subcontractor_budget = numOrNull("subcontractor_budget");
      body.overhead_budget = numOrNull("overhead_budget");
      body.original_revenue = numOrNull("original_revenue");
      body.revenue_additions = Number(form.get("revenue_additions") || 0) || 0;
      body.revenue_credits = Number(form.get("revenue_credits") || 0) || 0;
    }
    const ok = await patch(body);
    if (ok) setEditing(false);
  }

  async function onArchive() {
    if (!canEdit) return;
    const archived = project.status === "archived";
    const label = archived ? "restore" : "archive";
    if (!confirm(`${label[0].toUpperCase()}${label.slice(1)} this project?`)) {
      return;
    }
    await patch({ status: archived ? "active" : "archived" });
  }

  async function onDelete() {
    if (!canEdit) return;
    if (
      !confirm(
        `Permanently delete project ${project.project_number}? This removes its BOM, sections, and related data.`,
      )
    ) {
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Failed to delete project");
      return;
    }
    router.push("/projects");
    router.refresh();
  }

  return (
    <div className="stack" style={{ gap: "0.75rem" }}>
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "flex-start" }}
      >
        <div>
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            <Link href="/projects" className="section-link">
              Projects
            </Link>{" "}
            / {project.project_number}
          </p>
          <h1 className="page-title" style={{ marginTop: "0.35rem" }}>
            {project.project_number} · {project.name}
          </h1>
          <p className="page-sub">
            {project.client_name ?? "No client"}
            {project.project_manager_name
              ? ` · PM ${project.project_manager_name}`
              : ""}{" "}
            · default override{" "}
            {(Number(project.default_override_pct) * 100).toFixed(2)}% ·{" "}
            <span className={cn("badge", `badge-${project.status}`)}>
              {project.status.replace("_", " ")}
            </span>
          </p>
        </div>
        {canEdit ? (
          <div className="row" style={{ gap: "0.4rem" }}>
            <button
              type="button"
              className="btn"
              disabled={loading}
              onClick={() => {
                setEditing((v) => !v);
                setError(null);
              }}
            >
              {editing ? "Cancel" : "Edit"}
            </button>
            <OverflowMenu>
              <button
                type="button"
                className="menu-item"
                role="menuitem"
                disabled={loading}
                onClick={() => void onArchive()}
              >
                {project.status === "archived" ? "Unarchive" : "Archive"}
              </button>
              <button
                type="button"
                className="menu-item danger"
                role="menuitem"
                disabled={loading}
                onClick={() => void onDelete()}
              >
                Delete
              </button>
            </OverflowMenu>
          </div>
        ) : null}
      </div>

      {editing && canEdit ? (
        <form className="panel" style={{ padding: "1rem" }} onSubmit={onSave}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "0.65rem",
            }}
          >
            <div>
              <label className="label">Project #</label>
              <input
                className="field"
                name="project_number"
                required
                defaultValue={project.project_number}
                title="Auto format: YYYYMM + sequence (e.g. 20260701)"
              />
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--muted)" }}>
                Format YYYYMM + seq · POs use PO-YYMMPPnn
              </p>
            </div>
            <div>
              <label className="label">Name</label>
              <input
                className="field"
                name="name"
                required
                defaultValue={project.name}
              />
            </div>
            <div>
              <label className="label">Client</label>
              <select
                className="field"
                name="client_id"
                defaultValue={project.client_id ?? ""}
              >
                <option value="">—</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Project manager</label>
              <select
                className="field"
                name="project_manager_id"
                defaultValue={project.project_manager_id ?? ""}
              >
                <option value="">—</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select
                className="field"
                name="status"
                defaultValue={project.status}
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
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
                defaultValue={(
                  Number(project.default_override_pct) * 100
                ).toFixed(2)}
              />
            </div>
            <div>
              <label className="label">Start date</label>
              <input
                className="field"
                name="start_date"
                type="date"
                defaultValue={project.start_date ?? ""}
              />
            </div>
            <div>
              <label className="label">Target completion</label>
              <input
                className="field"
                name="target_completion_date"
                type="date"
                defaultValue={project.target_completion_date ?? ""}
              />
            </div>
            <div>
              <label className="label">% complete</label>
              <input
                className="field"
                name="percent_complete"
                type="number"
                min={0}
                max={100}
                step="1"
                defaultValue={project.percent_complete ?? 0}
              />
            </div>
            {canEditFinancials ? (
              <>
                <div>
                  <label className="label">Original revenue</label>
                  <input
                    className="field"
                    name="original_revenue"
                    type="number"
                    step="0.01"
                    defaultValue={project.original_revenue ?? ""}
                  />
                </div>
                <div>
                  <label className="label">Revenue additions</label>
                  <input
                    className="field"
                    name="revenue_additions"
                    type="number"
                    step="0.01"
                    defaultValue={project.revenue_additions ?? 0}
                  />
                </div>
                <div>
                  <label className="label">Revenue credits</label>
                  <input
                    className="field"
                    name="revenue_credits"
                    type="number"
                    step="0.01"
                    defaultValue={project.revenue_credits ?? 0}
                  />
                </div>
                <div>
                  <label className="label">Material budget</label>
                  <input
                    className="field"
                    name="material_budget"
                    type="number"
                    step="0.01"
                    defaultValue={project.material_budget ?? ""}
                  />
                </div>
                <div>
                  <label className="label">Labor budget</label>
                  <input
                    className="field"
                    name="labor_budget"
                    type="number"
                    step="0.01"
                    defaultValue={project.labor_budget ?? ""}
                  />
                </div>
                <div>
                  <label className="label">Expense budget</label>
                  <input
                    className="field"
                    name="expense_budget"
                    type="number"
                    step="0.01"
                    defaultValue={project.expense_budget ?? ""}
                  />
                </div>
                <div>
                  <label className="label">Subcontractor budget</label>
                  <input
                    className="field"
                    name="subcontractor_budget"
                    type="number"
                    step="0.01"
                    defaultValue={project.subcontractor_budget ?? ""}
                  />
                </div>
                <div>
                  <label className="label">Overhead budget</label>
                  <input
                    className="field"
                    name="overhead_budget"
                    type="number"
                    step="0.01"
                    defaultValue={project.overhead_budget ?? ""}
                  />
                </div>
              </>
            ) : null}
            <div>
              <label className="label">Notes</label>
              <input
                className="field"
                name="notes"
                defaultValue={project.notes ?? ""}
              />
            </div>
          </div>
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Saving…" : "Save changes"}
            </button>
            {error ? (
              <span style={{ color: "var(--danger)" }}>{error}</span>
            ) : null}
          </div>
        </form>
      ) : null}

      {!editing && error ? (
        <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>
      ) : null}
    </div>
  );
}
