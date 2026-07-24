"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChangeOrderStatus, ProjectChangeOrder } from "@/lib/types";
import { formatMoney, formatSignedMoney } from "@/lib/pricing";

interface Props {
  projectId: string;
  initialOrders: ProjectChangeOrder[];
  canEdit: boolean;
  canApprove: boolean;
}

const STATUS_BADGE: Record<ChangeOrderStatus, string> = {
  draft: "badge-neutral",
  submitted: "badge-blue",
  approved: "badge-green",
  rejected: "badge-red",
  void: "badge-neutral",
};

function emptyForm() {
  return {
    title: "",
    description: "",
    revenue_delta: "",
    budget_material_delta: "",
    budget_labor_delta: "",
    budget_expense_delta: "",
    budget_subcontractor_delta: "",
    budget_overhead_delta: "",
    effective_date: "",
    customer_reference: "",
  };
}

export function ChangeOrdersView({
  projectId,
  initialOrders,
  canEdit,
  canApprove,
}: Props) {
  const router = useRouter();
  const [orders, setOrders] = useState(initialOrders);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const summary = useMemo(() => {
    const approved = orders.filter((o) => o.status === "approved");
    const revenue = approved.reduce((s, o) => s + Number(o.revenue_delta || 0), 0);
    const pending = orders.filter((o) => o.status === "submitted").length;
    return { revenue, pending, approved: approved.length };
  }, [orders]);

  async function create() {
    if (!canEdit) return;
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/projects/${projectId}/change-orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        description: form.description || null,
        revenue_delta: Number(form.revenue_delta || 0),
        budget_material_delta: Number(form.budget_material_delta || 0),
        budget_labor_delta: Number(form.budget_labor_delta || 0),
        budget_expense_delta: Number(form.budget_expense_delta || 0),
        budget_subcontractor_delta: Number(form.budget_subcontractor_delta || 0),
        budget_overhead_delta: Number(form.budget_overhead_delta || 0),
        effective_date: form.effective_date || null,
        customer_reference: form.customer_reference || null,
        status: "draft",
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage(data.error || "Failed to create");
      return;
    }
    setOrders((prev) => [data.changeOrder, ...prev]);
    setShowForm(false);
    setForm(emptyForm());
    router.refresh();
  }

  async function setStatus(id: string, status: ChangeOrderStatus) {
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/projects/${projectId}/change-orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage(data.error || "Failed to update");
      return;
    }
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? data.changeOrder : o)),
    );
    router.refresh();
  }

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 className="page-title" style={{ fontSize: "1.25rem", margin: 0 }}>
            Change Orders
          </h2>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            Approved COs update Current Revenue and revised budgets.
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancel" : "New change order"}
          </button>
        ) : null}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "0.75rem",
        }}
      >
        <div className="workspace-stat">
          <div className="label">Approved revenue Δ</div>
          <div className="value">{formatSignedMoney(summary.revenue)}</div>
        </div>
        <div className="workspace-stat">
          <div className="label">Approved COs</div>
          <div className="value">{summary.approved}</div>
        </div>
        <div className="workspace-stat">
          <div className="label">Pending approval</div>
          <div className="value">{summary.pending}</div>
        </div>
      </div>

      {showForm ? (
        <form
          className="panel"
          style={{ padding: "1rem", display: "grid", gap: "0.65rem" }}
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label className="field">
            <span>Title</span>
            <input
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>Description</span>
            <input
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </label>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "0.65rem",
            }}
          >
            <label className="field">
              <span>Revenue delta (+/−)</span>
              <input
                type="number"
                step="0.01"
                value={form.revenue_delta}
                onChange={(e) =>
                  setForm((f) => ({ ...f, revenue_delta: e.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Material budget Δ</span>
              <input
                type="number"
                step="0.01"
                value={form.budget_material_delta}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    budget_material_delta: e.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Labor budget Δ</span>
              <input
                type="number"
                step="0.01"
                value={form.budget_labor_delta}
                onChange={(e) =>
                  setForm((f) => ({ ...f, budget_labor_delta: e.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Expense budget Δ</span>
              <input
                type="number"
                step="0.01"
                value={form.budget_expense_delta}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    budget_expense_delta: e.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Subcontractor budget Δ</span>
              <input
                type="number"
                step="0.01"
                value={form.budget_subcontractor_delta}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    budget_subcontractor_delta: e.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Overhead budget Δ</span>
              <input
                type="number"
                step="0.01"
                value={form.budget_overhead_delta}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    budget_overhead_delta: e.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Effective date</span>
              <input
                type="date"
                value={form.effective_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, effective_date: e.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Customer reference</span>
              <input
                value={form.customer_reference}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    customer_reference: e.target.value,
                  }))
                }
              />
            </label>
          </div>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Create draft"}
          </button>
        </form>
      ) : null}

      {message ? <p style={{ color: "var(--danger)", margin: 0 }}>{message}</p> : null}

      <div className="panel" style={{ padding: "0.75rem", overflowX: "auto" }}>
        <table className="data-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>CO #</th>
              <th>Title</th>
              <th style={{ textAlign: "right" }}>Revenue Δ</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No change orders yet.
                </td>
              </tr>
            ) : (
              orders.map((co) => (
                <tr key={co.id}>
                  <td>{co.co_number}</td>
                  <td>
                    <div>{co.title}</div>
                    {co.description ? (
                      <div className="muted" style={{ fontSize: "0.8rem" }}>
                        {co.description}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {formatSignedMoney(co.revenue_delta)}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[co.status]}`}>
                      {co.status}
                    </span>
                  </td>
                  <td>
                    <div className="row" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
                      {canEdit && co.status === "draft" ? (
                        <button
                          type="button"
                          className="btn"
                          disabled={saving}
                          onClick={() => void setStatus(co.id, "submitted")}
                        >
                          Submit
                        </button>
                      ) : null}
                      {canApprove && co.status === "submitted" ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={saving}
                            onClick={() => void setStatus(co.id, "approved")}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn"
                            disabled={saving}
                            onClick={() => void setStatus(co.id, "rejected")}
                          >
                            Reject
                          </button>
                        </>
                      ) : null}
                      {canApprove && co.status === "approved" ? (
                        <button
                          type="button"
                          className="btn"
                          disabled={saving}
                          onClick={() => void setStatus(co.id, "void")}
                        >
                          Void
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.75rem" }}>
          Budget deltas on approved COs revise category budgets used for variance
          ({formatMoney(0)} baseline shown on dashboard).
        </p>
      </div>
    </div>
  );
}
