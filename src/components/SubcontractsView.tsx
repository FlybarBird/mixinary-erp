"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectSubcontract, SubcontractStatus } from "@/lib/types";
import { formatMoney } from "@/lib/pricing";

interface Props {
  projectId: string;
  initialSubs: ProjectSubcontract[];
  vendors: { id: string; name: string }[];
  canEdit: boolean;
}

export function SubcontractsView({
  projectId,
  initialSubs,
  vendors,
  canEdit,
}: Props) {
  const router = useRouter();
  const [subs, setSubs] = useState(initialSubs);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    description: "",
    sub_name: "",
    vendor_id: "",
    contract_amount: "",
    status: "active" as SubcontractStatus,
  });
  const [billForms, setBillForms] = useState<
    Record<string, { amount: string; description: string }>
  >({});

  const totals = useMemo(() => {
    const active = subs.filter((s) => s.status === "active" || s.status === "complete");
    return {
      contract: active.reduce((s, x) => s + Number(x.contract_amount || 0), 0),
      billed: active.reduce((s, x) => s + Number(x.billed_to_date || 0), 0),
      paid: active.reduce((s, x) => s + Number(x.paid_to_date || 0), 0),
    };
  }, [subs]);

  async function create() {
    if (!canEdit) return;
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/projects/${projectId}/subcontracts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: form.description,
        sub_name: form.sub_name || null,
        vendor_id: form.vendor_id || null,
        contract_amount: Number(form.contract_amount || 0),
        status: form.status,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage(data.error || "Failed");
      return;
    }
    setSubs((prev) => [{ ...data.subcontract, bills: [] }, ...prev]);
    setForm({
      description: "",
      sub_name: "",
      vendor_id: "",
      contract_amount: "",
      status: "active",
    });
    router.refresh();
  }

  async function addBill(subId: string) {
    const f = billForms[subId] || { amount: "", description: "" };
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/subcontracts/${subId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        add_bill: {
          amount: Number(f.amount || 0),
          description: f.description || null,
        },
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage(data.error || "Failed");
      return;
    }
    const listRes = await fetch(`/api/projects/${projectId}/subcontracts`);
    const listData = await listRes.json();
    if (listRes.ok) setSubs(listData.subcontracts ?? []);
    setBillForms((prev) => ({
      ...prev,
      [subId]: { amount: "", description: "" },
    }));
    router.refresh();
  }

  async function setStatus(subId: string, status: SubcontractStatus) {
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/subcontracts/${subId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage(data.error || "Failed");
      return;
    }
    setSubs((prev) =>
      prev.map((s) => (s.id === subId ? { ...s, ...data.subcontract } : s)),
    );
    router.refresh();
  }

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div>
        <h2 className="page-title" style={{ fontSize: "1.25rem", margin: 0 }}>
          Subcontracts
        </h2>
        <p className="muted" style={{ margin: "0.25rem 0 0" }}>
          Active contracts post to the Subcontractors cost category.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "0.75rem",
        }}
      >
        <div className="workspace-stat">
          <div className="label">Contract value</div>
          <div className="value">{formatMoney(totals.contract)}</div>
        </div>
        <div className="workspace-stat">
          <div className="label">Billed</div>
          <div className="value">{formatMoney(totals.billed)}</div>
        </div>
        <div className="workspace-stat">
          <div className="label">Paid</div>
          <div className="value">{formatMoney(totals.paid)}</div>
        </div>
      </div>

      {canEdit ? (
        <form
          className="panel"
          style={{
            padding: "1rem",
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "0.65rem",
          }}
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            <span>Description</span>
            <input
              required
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>Sub name</span>
            <input
              value={form.sub_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, sub_name: e.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>Vendor</span>
            <select
              value={form.vendor_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, vendor_id: e.target.value }))
              }
            >
              <option value="">—</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Contract amount</span>
            <input
              type="number"
              step="0.01"
              value={form.contract_amount}
              onChange={(e) =>
                setForm((f) => ({ ...f, contract_amount: e.target.value }))
              }
            />
          </label>
          <div style={{ gridColumn: "1 / -1" }}>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              Add subcontract
            </button>
          </div>
        </form>
      ) : null}

      {message ? <p style={{ color: "var(--danger)", margin: 0 }}>{message}</p> : null}

      {subs.map((sub) => (
        <div key={sub.id} className="panel" style={{ padding: "0.9rem" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <strong>{sub.description}</strong>
              <div className="muted" style={{ fontSize: "0.85rem" }}>
                {sub.sub_name || "Sub"} · {formatMoney(sub.contract_amount)} ·{" "}
                <span className="badge badge-neutral">{sub.status}</span>
              </div>
            </div>
            {canEdit && sub.status === "active" ? (
              <button
                type="button"
                className="btn"
                disabled={saving}
                onClick={() => void setStatus(sub.id, "complete")}
              >
                Mark complete
              </button>
            ) : null}
            {canEdit && sub.status === "draft" ? (
              <button
                type="button"
                className="btn"
                disabled={saving}
                onClick={() => void setStatus(sub.id, "active")}
              >
                Activate
              </button>
            ) : null}
          </div>
          <div className="muted" style={{ marginTop: "0.35rem", fontSize: "0.85rem" }}>
            Billed {formatMoney(sub.billed_to_date)} · Paid{" "}
            {formatMoney(sub.paid_to_date)} · Remaining committed{" "}
            {formatMoney(
              Math.max(
                0,
                Number(sub.contract_amount || 0) - Number(sub.billed_to_date || 0),
              ),
            )}
          </div>
          {canEdit && (sub.status === "active" || sub.status === "complete") ? (
            <div
              className="row"
              style={{ gap: "0.5rem", marginTop: "0.65rem", flexWrap: "wrap" }}
            >
              <input
                className="field"
                style={{ minWidth: 140 }}
                placeholder="Bill amount"
                type="number"
                step="0.01"
                value={billForms[sub.id]?.amount || ""}
                onChange={(e) =>
                  setBillForms((prev) => ({
                    ...prev,
                    [sub.id]: {
                      amount: e.target.value,
                      description: prev[sub.id]?.description || "",
                    },
                  }))
                }
              />
              <input
                className="field"
                style={{ minWidth: 180 }}
                placeholder="Bill note"
                value={billForms[sub.id]?.description || ""}
                onChange={(e) =>
                  setBillForms((prev) => ({
                    ...prev,
                    [sub.id]: {
                      amount: prev[sub.id]?.amount || "",
                      description: e.target.value,
                    },
                  }))
                }
              />
              <button
                type="button"
                className="btn"
                disabled={saving}
                onClick={() => void addBill(sub.id)}
              >
                Add bill
              </button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
