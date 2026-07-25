"use client";

import { useState, useMemo, useEffect } from "react";
import type { ProjectExpense, ExpenseCategory, ApprovalStatus, PaymentStatus } from "@/lib/types";
import { formatMoney } from "@/lib/pricing";
import { useProjectExpenseSummary } from "@/components/ProjectBomSummaryBar";
import { sumApprovedExpenses } from "@/lib/projects/expense-totals";

interface Props {
  projectId: string;
  initialExpenses: ProjectExpense[];
  canEdit: boolean;
  canApprove: boolean;
  changeOrders?: Array<{ id: string; co_number: string; title: string }>;
}

const CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: "shipping_freight", label: "Shipping / Freight" },
  { value: "equipment_rental", label: "Equipment Rental" },
  { value: "travel", label: "Travel" },
  { value: "lodging", label: "Lodging" },
  { value: "meals", label: "Meals" },
  { value: "permits", label: "Permits" },
  { value: "subcontractors", label: "Subcontractors" },
  { value: "tools_supplies", label: "Tools & Supplies" },
  { value: "miscellaneous", label: "Miscellaneous" },
];

const CATEGORY_LABEL: Record<ExpenseCategory, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label]),
) as Record<ExpenseCategory, string>;

const APPROVAL_BADGE: Record<ApprovalStatus, string> = {
  pending: "badge-neutral",
  approved: "badge-green",
  rejected: "badge-red",
};

const PAYMENT_BADGE: Record<PaymentStatus, string> = {
  unpaid: "badge-neutral",
  paid: "badge-green",
  reimbursed: "badge-blue",
};

function emptyForm() {
  return {
    expense_date: new Date().toISOString().slice(0, 10),
    category: "miscellaneous" as ExpenseCategory,
    payee: "",
    description: "",
    amount: "",
    tax: "",
    cost_code: "",
    is_additional_charge: false,
    is_billable: false,
    change_order_id: "",
    receipt_path: "",
    notes: "",
  };
}

export function ExpensesView({
  projectId,
  initialExpenses,
  canEdit,
  canApprove,
  changeOrders = [],
}: Props) {
  const [expenses, setExpenses] = useState<ProjectExpense[]>(initialExpenses);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const expenseSummary = useProjectExpenseSummary();
  const setApprovedExpenses = expenseSummary?.setApprovedExpenses;
  useEffect(() => {
    setApprovedExpenses?.(sumApprovedExpenses(expenses));
  }, [expenses, setApprovedExpenses]);

  const summary = useMemo(() => {
    const rows = expenses.filter(Boolean);
    const total = rows.reduce(
      (s, e) => s + Number(e.amount ?? 0) + Number(e.tax ?? 0),
      0,
    );
    const approved = rows
      .filter((e) => e.approval_status === "approved")
      .reduce((s, e) => s + Number(e.amount ?? 0) + Number(e.tax ?? 0), 0);
    const paid = rows
      .filter(
        (e) =>
          e.payment_status === "paid" || e.payment_status === "reimbursed",
      )
      .reduce((s, e) => s + Number(e.amount ?? 0) + Number(e.tax ?? 0), 0);

    const byCategory = new Map<ExpenseCategory, number>();
    for (const e of rows) {
      byCategory.set(
        e.category,
        (byCategory.get(e.category) ?? 0) +
          Number(e.amount ?? 0) +
          Number(e.tax ?? 0),
      );
    }

    return { total, approved, paid, byCategory };
  }, [expenses]);

  function fieldVal<K extends keyof ReturnType<typeof emptyForm>>(name: K, value: ReturnType<typeof emptyForm>[K]) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  function startEdit(expense: ProjectExpense) {
    setEditingId(expense.id);
    setForm({
      expense_date: expense.expense_date,
      category: expense.category,
      payee: expense.payee ?? "",
      description: expense.description,
      amount: String(expense.amount ?? ""),
      tax: String(expense.tax ?? ""),
      cost_code: expense.cost_code ?? "",
      is_additional_charge: expense.is_additional_charge,
      is_billable: Boolean(expense.is_billable),
      change_order_id: expense.change_order_id ?? "",
      receipt_path: expense.receipt_path ?? "",
      notes: expense.notes ?? "",
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
        expense_date: form.expense_date,
        category: form.category,
        payee: form.payee || null,
        description: form.description,
        amount: form.amount ? Number(form.amount) : 0,
        tax: form.tax ? Number(form.tax) : 0,
        cost_code: form.cost_code || null,
        is_additional_charge: form.is_additional_charge,
        is_billable: form.is_billable,
        change_order_id: form.change_order_id || null,
        receipt_path: form.receipt_path || null,
        notes: form.notes || null,
      };

      let res: Response;
      if (editingId) {
        res = await fetch(`/api/projects/${projectId}/expenses/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/projects/${projectId}/expenses`, {
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

      if (!json.expense) {
        setMessage("Saved, but no expense was returned");
        return;
      }
      if (editingId) {
        setExpenses((prev) =>
          prev.map((e) => (e?.id === editingId ? json.expense : e)).filter(Boolean),
        );
      } else {
        setExpenses((prev) => [json.expense, ...prev.filter(Boolean)]);
      }
      cancelForm();
    } finally {
      setSaving(false);
    }
  }

  async function deleteExpense(id: string) {
    if (!confirm("Delete this expense?")) return;
    const res = await fetch(`/api/projects/${projectId}/expenses/${id}`, { method: "DELETE" });
    if (res.ok) {
      setExpenses((prev) => prev.filter((e) => e.id !== id));
    }
  }

  async function setApproval(id: string, approval_status: ApprovalStatus) {
    const res = await fetch(`/api/projects/${projectId}/expenses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approval_status }),
    });
    if (res.ok) {
      const { expense } = await res.json();
      setExpenses((prev) => prev.map((e) => (e.id === id ? expense : e)));
    }
  }

  async function setPayment(id: string, payment_status: PaymentStatus) {
    const res = await fetch(`/api/projects/${projectId}/expenses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment_status }),
    });
    if (res.ok) {
      const { expense } = await res.json();
      setExpenses((prev) => prev.map((e) => (e.id === id ? expense : e)));
    }
  }

  return (
    <div className="stack">
      <div className="workspace-summary">
        <div className="workspace-stat">
          <div className="label">Total Expenses</div>
          <div className="value">{formatMoney(summary.total)}</div>
        </div>
        <div className="workspace-stat">
          <div className="label">Approved</div>
          <div className="value">{formatMoney(summary.approved)}</div>
        </div>
        <div className="workspace-stat">
          <div className="label">Paid / Reimbursed</div>
          <div className="value">{formatMoney(summary.paid)}</div>
        </div>
        <div className="workspace-stat">
          <div className="label">Count</div>
          <div className="value">{expenses.filter(Boolean).length}</div>
        </div>
      </div>

      {summary.byCategory.size > 0 && (
        <div className="panel" style={{ padding: "1rem" }}>
          <div style={{ fontWeight: 600, marginBottom: "0.5rem", fontSize: "0.85rem" }}>By Category</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
            {[...summary.byCategory.entries()].map(([cat, total]) => (
              <div key={cat} style={{ fontSize: "0.8rem" }}>
                <span style={{ color: "var(--muted)" }}>{CATEGORY_LABEL[cat]}: </span>
                <strong>{formatMoney(total)}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>Expenses</h2>
        {canEdit && !showForm && (
          <button className="btn" onClick={() => setShowForm(true)}>
            + Add Expense
          </button>
        )}
      </div>

      {showForm && canEdit && (
        <div className="panel" style={{ padding: "1rem" }}>
          <div style={{ fontWeight: 600, marginBottom: "0.75rem" }}>
            {editingId ? "Edit Expense" : "New Expense"}
          </div>
          {message && (
            <div style={{ color: "var(--red, red)", marginBottom: "0.5rem", fontSize: "0.85rem" }}>
              {message}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.6rem" }}>
            <label className="field">
              <span>Date</span>
              <input type="date" value={form.expense_date} onChange={(e) => fieldVal("expense_date", e.target.value)} />
            </label>
            <label className="field">
              <span>Category</span>
              <select value={form.category} onChange={(e) => fieldVal("category", e.target.value as ExpenseCategory)}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Payee</span>
              <input value={form.payee} onChange={(e) => fieldVal("payee", e.target.value)} />
            </label>
            <label className="field">
              <span>Amount ($)</span>
              <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => fieldVal("amount", e.target.value)} />
            </label>
            <label className="field">
              <span>Tax ($)</span>
              <input type="number" min="0" step="0.01" value={form.tax} onChange={(e) => fieldVal("tax", e.target.value)} />
            </label>
            <label className="field">
              <span>Cost Code</span>
              <input value={form.cost_code} onChange={(e) => fieldVal("cost_code", e.target.value)} />
            </label>
            <label className="field" style={{ gridColumn: "1 / -1" }}>
              <span>Description *</span>
              <input value={form.description} onChange={(e) => fieldVal("description", e.target.value)} />
            </label>
            <label className="field" style={{ gridColumn: "1 / -1" }}>
              <span>Notes</span>
              <input value={form.notes} onChange={(e) => fieldVal("notes", e.target.value)} />
            </label>
            <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: "0.4rem", gridColumn: "1 / -1" }}>
              <input
                type="checkbox"
                checked={form.is_additional_charge}
                onChange={(e) => fieldVal("is_additional_charge", e.target.checked)}
                style={{ width: "auto" }}
              />
              <span>Additional charge to client</span>
            </label>
            <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: "0.4rem", gridColumn: "1 / -1" }}>
              <input
                type="checkbox"
                checked={form.is_billable}
                onChange={(e) => fieldVal("is_billable", e.target.checked)}
                style={{ width: "auto" }}
              />
              <span>Billable to client</span>
            </label>
            <label className="field">
              <span>Linked change order</span>
              <select
                value={form.change_order_id}
                onChange={(e) => fieldVal("change_order_id", e.target.value)}
              >
                <option value="">—</option>
                {changeOrders.map((co) => (
                  <option key={co.id} value={co.id}>
                    {co.co_number} · {co.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Receipt path / URL</span>
              <input
                value={form.receipt_path}
                onChange={(e) => fieldVal("receipt_path", e.target.value)}
                placeholder="Optional receipt reference"
              />
            </label>
            <label className="field">
              <span>Upload receipt</span>
              <input
                type="file"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const fd = new FormData();
                  fd.set("file", file);
                  fd.set("entity_type", "expense");
                  fd.set("entity_id", editingId || projectId);
                  const res = await fetch(`/api/projects/${projectId}/attachments`, {
                    method: "POST",
                    body: fd,
                  });
                  const data = await res.json().catch(() => ({}));
                  if (res.ok && data.attachment?.file_path) {
                    fieldVal("receipt_path", data.attachment.file_path);
                  } else {
                    setMessage(data.error || "Receipt upload failed");
                  }
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
            <button className="btn" onClick={save} disabled={saving || !form.description}>
              {saving ? "Saving…" : editingId ? "Update" : "Add Expense"}
            </button>
            <button className="btn" style={{ background: "none", border: "1px solid var(--line)" }} onClick={cancelForm}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {expenses.filter(Boolean).length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No expenses yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="bom-table" style={{ width: "100%", minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Date</th>
                <th style={{ textAlign: "left" }}>Category</th>
                <th style={{ textAlign: "left" }}>Payee</th>
                <th style={{ textAlign: "left" }}>Description</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th style={{ textAlign: "right" }}>Tax</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th style={{ textAlign: "center" }}>Add&rsquo;l</th>
                <th style={{ textAlign: "center" }}>Approval</th>
                <th style={{ textAlign: "center" }}>Payment</th>
                {(canEdit || canApprove) && <th />}
              </tr>
            </thead>
            <tbody>
              {expenses.filter(Boolean).map((expense) => (
                <tr key={expense.id}>
                  <td>{expense.expense_date}</td>
                  <td>{CATEGORY_LABEL[expense.category]}</td>
                  <td>{expense.payee ?? "—"}</td>
                  <td>{expense.description}</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(expense.amount)}</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(expense.tax)}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>
                    {formatMoney(Number(expense.amount ?? 0) + Number(expense.tax ?? 0))}
                  </td>
                  <td style={{ textAlign: "center" }}>{expense.is_additional_charge ? "Yes" : "—"}</td>
                  <td style={{ textAlign: "center" }}>
                    <span className={`badge ${APPROVAL_BADGE[expense.approval_status]}`}>
                      {expense.approval_status}
                    </span>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span className={`badge ${PAYMENT_BADGE[expense.payment_status]}`}>
                      {expense.payment_status}
                    </span>
                  </td>
                  {(canEdit || canApprove) && (
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {canApprove && expense.approval_status !== "approved" && (
                        <button
                          className="btn"
                          style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem", marginRight: "0.25rem" }}
                          onClick={() => setApproval(expense.id, "approved")}
                        >
                          Approve
                        </button>
                      )}
                      {canApprove && expense.approval_status === "approved" && (
                        <button
                          className="btn"
                          style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem", marginRight: "0.25rem", opacity: 0.6 }}
                          onClick={() => setApproval(expense.id, "pending")}
                        >
                          Unapprove
                        </button>
                      )}
                      {canApprove && expense.payment_status === "unpaid" && expense.approval_status === "approved" && (
                        <button
                          className="btn"
                          style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem", marginRight: "0.25rem" }}
                          onClick={() => setPayment(expense.id, "paid")}
                        >
                          Mark Paid
                        </button>
                      )}
                      {canEdit && (
                        <button
                          className="btn"
                          style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem", marginRight: "0.25rem" }}
                          onClick={() => startEdit(expense)}
                        >
                          Edit
                        </button>
                      )}
                      {canEdit && (
                        <button
                          className="btn"
                          style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem", background: "none", border: "1px solid var(--red, #c00)", color: "var(--red, #c00)" }}
                          onClick={() => deleteExpense(expense.id)}
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
