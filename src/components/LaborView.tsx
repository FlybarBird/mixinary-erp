"use client";

import { useState, useMemo } from "react";
import type { LaborEntry, ApprovalStatus } from "@/lib/types";
import { formatMoney } from "@/lib/pricing";

interface Props {
  projectId: string;
  initialEntries: LaborEntry[];
  canEdit: boolean;
  canApprove: boolean;
  canViewRates?: boolean;
}

const CATEGORIES = [
  "Installation",
  "Programming",
  "Engineering",
  "Project Management",
  "Travel",
  "Testing / Commissioning",
  "Training",
  "Other",
];

const APPROVAL_LABELS: Record<ApprovalStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const APPROVAL_BADGE: Record<ApprovalStatus, string> = {
  pending: "badge-neutral",
  approved: "badge-green",
  rejected: "badge-red",
};

function emptyForm() {
  return {
    worker_name: "",
    work_category: "",
    task_description: "",
    work_date: new Date().toISOString().slice(0, 10),
    estimated_hours: "",
    actual_hours: "",
    regular_hours: "",
    overtime_hours: "",
    hourly_rate: "",
    notes: "",
  };
}

export function LaborView({
  projectId,
  initialEntries,
  canEdit,
  canApprove,
  canViewRates = false,
}: Props) {
  const [entries, setEntries] = useState<LaborEntry[]>(initialEntries);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const summary = useMemo(() => {
    const estHours = entries.reduce((s, e) => s + Number(e.estimated_hours ?? 0), 0);
    const actHours = entries.reduce((s, e) => s + Number(e.actual_hours ?? 0), 0);
    const totalCost = entries.reduce((s, e) => s + Number(e.total_cost ?? 0), 0);
    const approvedCost = entries
      .filter((e) => e.approval_status === "approved")
      .reduce((s, e) => s + Number(e.total_cost ?? 0), 0);

    const byWorker = new Map<string, { hours: number; cost: number }>();
    const byCategory = new Map<string, { hours: number; cost: number }>();

    for (const e of entries) {
      const hours = Number(e.actual_hours ?? 0);
      const cost = Number(e.total_cost ?? 0);

      const w = byWorker.get(e.worker_name) ?? { hours: 0, cost: 0 };
      byWorker.set(e.worker_name, { hours: w.hours + hours, cost: w.cost + cost });

      if (e.work_category) {
        const c = byCategory.get(e.work_category) ?? { hours: 0, cost: 0 };
        byCategory.set(e.work_category, { hours: c.hours + hours, cost: c.cost + cost });
      }
    }

    return { estHours, actHours, totalCost, approvedCost, byWorker, byCategory };
  }, [entries]);

  function fieldVal(name: string, value: string) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  function startEdit(entry: LaborEntry) {
    setEditingId(entry.id);
    setForm({
      worker_name: entry.worker_name,
      work_category: entry.work_category ?? "",
      task_description: entry.task_description ?? "",
      work_date: entry.work_date,
      estimated_hours: String(entry.estimated_hours ?? ""),
      actual_hours: String(entry.actual_hours ?? ""),
      regular_hours: String(entry.regular_hours ?? ""),
      overtime_hours: String(entry.overtime_hours ?? ""),
      hourly_rate: String(entry.hourly_rate ?? ""),
      notes: entry.notes ?? "",
    });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
    setMessage(null);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        worker_name: form.worker_name,
        work_category: form.work_category || null,
        task_description: form.task_description || null,
        work_date: form.work_date,
        estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : 0,
        actual_hours: form.actual_hours ? Number(form.actual_hours) : 0,
        regular_hours: form.regular_hours ? Number(form.regular_hours) : 0,
        overtime_hours: form.overtime_hours ? Number(form.overtime_hours) : 0,
        hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : 0,
        notes: form.notes || null,
      };

      let res: Response;
      if (editingId) {
        res = await fetch(`/api/projects/${projectId}/labor/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/projects/${projectId}/labor`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error ?? "Failed to save");
        return;
      }

      if (editingId) {
        setEntries((prev) => prev.map((e) => (e.id === editingId ? json.entry : e)));
      } else {
        setEntries((prev) => [json.entry, ...prev]);
      }
      cancelForm();
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(id: string) {
    if (!confirm("Delete this labor entry?")) return;
    const res = await fetch(`/api/projects/${projectId}/labor/${id}`, { method: "DELETE" });
    if (res.ok) {
      setEntries((prev) => prev.filter((e) => e.id !== id));
    }
  }

  async function setApproval(id: string, approval_status: ApprovalStatus) {
    const res = await fetch(`/api/projects/${projectId}/labor/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approval_status }),
    });
    if (res.ok) {
      const { entry } = await res.json();
      setEntries((prev) => prev.map((e) => (e.id === id ? entry : e)));
    }
  }

  return (
    <div className="stack">
      <div className="workspace-summary">
        <div className="workspace-stat">
          <div className="label">Est. Hours</div>
          <div className="value">{summary.estHours.toFixed(1)}</div>
        </div>
        <div className="workspace-stat">
          <div className="label">Actual Hours</div>
          <div className="value">{summary.actHours.toFixed(1)}</div>
        </div>
        {canViewRates ? (
          <div className="workspace-stat">
            <div className="label">Total Cost</div>
            <div className="value">{formatMoney(summary.totalCost)}</div>
          </div>
        ) : null}
        {canViewRates ? (
          <div className="workspace-stat">
            <div className="label">Approved Cost</div>
            <div className="value">{formatMoney(summary.approvedCost)}</div>
          </div>
        ) : null}
        <div className="workspace-stat">
          <div className="label">Entries</div>
          <div className="value">{entries.length}</div>
        </div>
      </div>

      {(summary.byWorker.size > 0 || summary.byCategory.size > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          {summary.byWorker.size > 0 && (
            <div className="panel" style={{ padding: "1rem" }}>
              <div style={{ fontWeight: 600, marginBottom: "0.5rem", fontSize: "0.85rem" }}>By Worker</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", paddingBottom: "0.25rem" }}>Worker</th>
                    <th style={{ textAlign: "right", paddingBottom: "0.25rem" }}>Hours</th>
                    {canViewRates ? (
                      <th style={{ textAlign: "right", paddingBottom: "0.25rem" }}>Cost</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {[...summary.byWorker.entries()].map(([worker, { hours, cost }]) => (
                    <tr key={worker}>
                      <td style={{ padding: "0.15rem 0" }}>{worker}</td>
                      <td style={{ textAlign: "right" }}>{hours.toFixed(1)}</td>
                      {canViewRates ? (
                        <td style={{ textAlign: "right" }}>{formatMoney(cost)}</td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {summary.byCategory.size > 0 && (
            <div className="panel" style={{ padding: "1rem" }}>
              <div style={{ fontWeight: 600, marginBottom: "0.5rem", fontSize: "0.85rem" }}>By Category</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", paddingBottom: "0.25rem" }}>Category</th>
                    <th style={{ textAlign: "right", paddingBottom: "0.25rem" }}>Hours</th>
                    {canViewRates ? (
                      <th style={{ textAlign: "right", paddingBottom: "0.25rem" }}>Cost</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {[...summary.byCategory.entries()].map(([cat, { hours, cost }]) => (
                    <tr key={cat}>
                      <td style={{ padding: "0.15rem 0" }}>{cat}</td>
                      <td style={{ textAlign: "right" }}>{hours.toFixed(1)}</td>
                      {canViewRates ? (
                        <td style={{ textAlign: "right" }}>{formatMoney(cost)}</td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>Labor Entries</h2>
        {canEdit && !showForm && (
          <button className="btn" onClick={() => setShowForm(true)}>
            + Add Entry
          </button>
        )}
      </div>

      {showForm && canEdit && (
        <div className="panel" style={{ padding: "1rem" }}>
          <div style={{ fontWeight: 600, marginBottom: "0.75rem" }}>
            {editingId ? "Edit Labor Entry" : "New Labor Entry"}
          </div>
          {message && (
            <div style={{ color: "var(--red, red)", marginBottom: "0.5rem", fontSize: "0.85rem" }}>
              {message}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.6rem" }}>
            <label className="field">
              <span>Worker Name *</span>
              <input value={form.worker_name} onChange={(e) => fieldVal("worker_name", e.target.value)} />
            </label>
            <label className="field">
              <span>Category</span>
              <select value={form.work_category} onChange={(e) => fieldVal("work_category", e.target.value)}>
                <option value="">— none —</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Date</span>
              <input type="date" value={form.work_date} onChange={(e) => fieldVal("work_date", e.target.value)} />
            </label>
            {canViewRates ? (
              <label className="field">
                <span>Hourly Rate ($)</span>
                <input type="number" min="0" step="0.01" value={form.hourly_rate} onChange={(e) => fieldVal("hourly_rate", e.target.value)} />
              </label>
            ) : null}
            <label className="field">
              <span>Est. Hours</span>
              <input type="number" min="0" step="0.25" value={form.estimated_hours} onChange={(e) => fieldVal("estimated_hours", e.target.value)} />
            </label>
            <label className="field">
              <span>Actual Hours</span>
              <input type="number" min="0" step="0.25" value={form.actual_hours} onChange={(e) => fieldVal("actual_hours", e.target.value)} />
            </label>
            <label className="field">
              <span>Regular Hours</span>
              <input type="number" min="0" step="0.25" value={form.regular_hours} onChange={(e) => fieldVal("regular_hours", e.target.value)} />
            </label>
            <label className="field">
              <span>Overtime Hours</span>
              <input type="number" min="0" step="0.25" value={form.overtime_hours} onChange={(e) => fieldVal("overtime_hours", e.target.value)} />
            </label>
            <label className="field" style={{ gridColumn: "1 / -1" }}>
              <span>Task Description</span>
              <input value={form.task_description} onChange={(e) => fieldVal("task_description", e.target.value)} />
            </label>
            <label className="field" style={{ gridColumn: "1 / -1" }}>
              <span>Notes</span>
              <input value={form.notes} onChange={(e) => fieldVal("notes", e.target.value)} />
            </label>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
            <button className="btn" onClick={save} disabled={saving || !form.worker_name}>
              {saving ? "Saving…" : editingId ? "Update" : "Add Entry"}
            </button>
            <button className="btn" style={{ background: "none", border: "1px solid var(--line)" }} onClick={cancelForm}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No labor entries yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="bom-table" style={{ width: "100%", minWidth: 800 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Worker</th>
                <th style={{ textAlign: "left" }}>Category</th>
                <th style={{ textAlign: "left" }}>Task</th>
                <th style={{ textAlign: "left" }}>Date</th>
                <th style={{ textAlign: "right" }}>Est. Hrs</th>
                <th style={{ textAlign: "right" }}>Actual Hrs</th>
                <th style={{ textAlign: "right" }}>Reg</th>
                <th style={{ textAlign: "right" }}>OT</th>
                {canViewRates ? (
                  <th style={{ textAlign: "right" }}>Rate</th>
                ) : null}
                {canViewRates ? (
                  <th style={{ textAlign: "right" }}>Total Cost</th>
                ) : null}
                <th style={{ textAlign: "center" }}>Status</th>
                {(canEdit || canApprove) && <th />}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.worker_name}</td>
                  <td>{entry.work_category ?? "—"}</td>
                  <td>{entry.task_description ?? "—"}</td>
                  <td>{entry.work_date}</td>
                  <td style={{ textAlign: "right" }}>{Number(entry.estimated_hours ?? 0).toFixed(1)}</td>
                  <td style={{ textAlign: "right" }}>{Number(entry.actual_hours ?? 0).toFixed(1)}</td>
                  <td style={{ textAlign: "right" }}>{Number(entry.regular_hours ?? 0).toFixed(1)}</td>
                  <td style={{ textAlign: "right" }}>{Number(entry.overtime_hours ?? 0).toFixed(1)}</td>
                  {canViewRates ? (
                    <td style={{ textAlign: "right" }}>{formatMoney(entry.hourly_rate)}</td>
                  ) : null}
                  {canViewRates ? (
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{formatMoney(entry.total_cost)}</td>
                  ) : null}
                  <td style={{ textAlign: "center" }}>
                    <span className={`badge ${APPROVAL_BADGE[entry.approval_status]}`}>
                      {APPROVAL_LABELS[entry.approval_status]}
                    </span>
                  </td>
                  {(canEdit || canApprove) && (
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {canApprove && entry.approval_status !== "approved" && (
                        <button
                          className="btn"
                          style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem", marginRight: "0.25rem" }}
                          onClick={() => setApproval(entry.id, "approved")}
                        >
                          Approve
                        </button>
                      )}
                      {canApprove && entry.approval_status === "approved" && (
                        <button
                          className="btn"
                          style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem", marginRight: "0.25rem", opacity: 0.6 }}
                          onClick={() => setApproval(entry.id, "pending")}
                        >
                          Unapprove
                        </button>
                      )}
                      {canEdit && (
                        <button
                          className="btn"
                          style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem", marginRight: "0.25rem" }}
                          onClick={() => startEdit(entry)}
                        >
                          Edit
                        </button>
                      )}
                      {canEdit && (
                        <button
                          className="btn"
                          style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem", background: "none", border: "1px solid var(--red, #c00)", color: "var(--red, #c00)" }}
                          onClick={() => deleteEntry(entry.id)}
                        >
                          Del
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
