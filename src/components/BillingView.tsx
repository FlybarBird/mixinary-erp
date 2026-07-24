"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ProjectInvoice,
  ProjectPayment,
  VendorBill,
  VendorBillStatus,
} from "@/lib/types";
import { formatMoney } from "@/lib/pricing";

interface Props {
  projectId: string;
  initialInvoices: ProjectInvoice[];
  initialPayments: ProjectPayment[];
  initialVendorBills: VendorBill[];
  purchaseOrders: { id: string; po_number: string; vendor_id: string | null }[];
  vendors: { id: string; name: string }[];
  canEdit: boolean;
  canManageAp: boolean;
}

export function BillingView({
  projectId,
  initialInvoices,
  initialPayments,
  initialVendorBills,
  purchaseOrders,
  vendors,
  canEdit,
  canManageAp,
}: Props) {
  const router = useRouter();
  const [invoices, setInvoices] = useState(initialInvoices);
  const [payments, setPayments] = useState(initialPayments);
  const [vendorBills, setVendorBills] = useState(initialVendorBills);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [invForm, setInvForm] = useState({
    description: "Progress billing",
    amount: "",
    tax: "",
    due_date: "",
    send: false,
  });
  const [payForm, setPayForm] = useState({
    invoice_id: "",
    amount: "",
    payment_date: new Date().toISOString().slice(0, 10),
    method: "",
    reference: "",
  });
  const [apForm, setApForm] = useState({
    purchase_order_id: "",
    vendor_id: "",
    vendor_invoice_number: "",
    amount: "",
    bill_date: new Date().toISOString().slice(0, 10),
    status: "billed" as VendorBillStatus,
  });

  const summary = useMemo(() => {
    const billed = invoices
      .filter((i) => ["sent", "partially_paid", "paid"].includes(i.status))
      .reduce((s, i) => s + Number(i.total || 0), 0);
    const collected = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const ar = Math.max(0, billed - collected);
    const apUnpaid = vendorBills
      .filter((b) => b.status !== "void")
      .reduce(
        (s, b) =>
          s + Math.max(0, Number(b.amount || 0) - Number(b.amount_paid || 0)),
        0,
      );
    return { billed, collected, ar, apUnpaid };
  }, [invoices, payments, vendorBills]);

  async function createInvoice() {
    if (!canEdit) return;
    setSaving(true);
    setMessage(null);
    const amount = Number(invForm.amount || 0);
    const res = await fetch(`/api/projects/${projectId}/invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tax: Number(invForm.tax || 0),
        due_date: invForm.due_date || null,
        status: invForm.send ? "sent" : "draft",
        lines: [
          {
            description: invForm.description || "Invoice line",
            quantity: 1,
            unit_price: amount,
          },
        ],
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage(data.error || "Failed to create invoice");
      return;
    }
    setInvoices((prev) => [data.invoice, ...prev]);
    setInvForm({
      description: "Progress billing",
      amount: "",
      tax: "",
      due_date: "",
      send: false,
    });
    router.refresh();
  }

  async function markSent(id: string) {
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "sent" }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage(data.error || "Failed");
      return;
    }
    setInvoices((prev) => prev.map((i) => (i.id === id ? data.invoice : i)));
    router.refresh();
  }

  async function recordPayment() {
    if (!canEdit) return;
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/projects/${projectId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoice_id: payForm.invoice_id || undefined,
        amount: Number(payForm.amount || 0),
        payment_date: payForm.payment_date,
        method: payForm.method || null,
        reference: payForm.reference || null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage(data.error || "Failed to record payment");
      return;
    }
    setPayments((prev) => [data.payment, ...prev]);
    // Refresh invoices for amount_paid
    const invRes = await fetch(`/api/projects/${projectId}/invoices`);
    const invData = await invRes.json();
    if (invRes.ok) {
      setInvoices(invData.invoices ?? []);
      setPayments(invData.payments ?? []);
    }
    setPayForm({
      invoice_id: "",
      amount: "",
      payment_date: new Date().toISOString().slice(0, 10),
      method: "",
      reference: "",
    });
    router.refresh();
  }

  async function createVendorBill() {
    if (!canManageAp) return;
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/projects/${projectId}/vendor-bills`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        purchase_order_id: apForm.purchase_order_id || null,
        vendor_id: apForm.vendor_id || null,
        vendor_invoice_number: apForm.vendor_invoice_number || null,
        amount: Number(apForm.amount || 0),
        bill_date: apForm.bill_date || null,
        status: apForm.status,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage(data.error || "Failed to create vendor bill");
      return;
    }
    setVendorBills((prev) => [data.vendorBill, ...prev]);
    router.refresh();
  }

  async function markVendorPaid(id: string, amount: number) {
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/vendor-bills/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount_paid: amount, status: "paid" }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage(data.error || "Failed");
      return;
    }
    setVendorBills((prev) =>
      prev.map((b) => (b.id === id ? data.vendorBill : b)),
    );
    router.refresh();
  }

  const openInvoices = invoices.filter((i) =>
    ["sent", "partially_paid"].includes(i.status),
  );

  return (
    <div className="stack" style={{ gap: "1.25rem" }}>
      <div>
        <h2 className="page-title" style={{ fontSize: "1.25rem", margin: 0 }}>
          Billing & AP
        </h2>
        <p className="muted" style={{ margin: "0.25rem 0 0" }}>
          Invoices track billed/collected/AR. Contract revenue stays on change
          orders + original revenue.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "0.75rem",
        }}
      >
        <div className="workspace-stat">
          <div className="label">Billed</div>
          <div className="value">{formatMoney(summary.billed)}</div>
        </div>
        <div className="workspace-stat">
          <div className="label">Collected</div>
          <div className="value">{formatMoney(summary.collected)}</div>
        </div>
        <div className="workspace-stat">
          <div className="label">AR outstanding</div>
          <div className="value">{formatMoney(summary.ar)}</div>
        </div>
        <div className="workspace-stat">
          <div className="label">Vendor AP unpaid</div>
          <div className="value">{formatMoney(summary.apUnpaid)}</div>
        </div>
      </div>

      {message ? <p style={{ color: "var(--danger)", margin: 0 }}>{message}</p> : null}

      {canEdit ? (
        <div
          className="panel"
          style={{
            padding: "1rem",
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr",
            gap: "1rem",
          }}
        >
          <div className="stack" style={{ gap: "0.5rem" }}>
            <strong>New invoice</strong>
            <label className="field">
              <span>Description</span>
              <input
                value={invForm.description}
                onChange={(e) =>
                  setInvForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Amount</span>
              <input
                type="number"
                step="0.01"
                value={invForm.amount}
                onChange={(e) =>
                  setInvForm((f) => ({ ...f, amount: e.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Tax</span>
              <input
                type="number"
                step="0.01"
                value={invForm.tax}
                onChange={(e) =>
                  setInvForm((f) => ({ ...f, tax: e.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Due date</span>
              <input
                type="date"
                value={invForm.due_date}
                onChange={(e) =>
                  setInvForm((f) => ({ ...f, due_date: e.target.value }))
                }
              />
            </label>
            <label className="row" style={{ gap: "0.4rem" }}>
              <input
                type="checkbox"
                checked={invForm.send}
                onChange={(e) =>
                  setInvForm((f) => ({ ...f, send: e.target.checked }))
                }
              />
              <span>Mark as sent</span>
            </label>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
              onClick={() => void createInvoice()}
            >
              Create invoice
            </button>
          </div>

          <div className="stack" style={{ gap: "0.5rem" }}>
            <strong>Record payment</strong>
            <label className="field">
              <span>Apply to invoice</span>
              <select
                value={payForm.invoice_id}
                onChange={(e) =>
                  setPayForm((f) => ({ ...f, invoice_id: e.target.value }))
                }
              >
                <option value="">—</option>
                {openInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoice_number} · open{" "}
                    {formatMoney(
                      Number(inv.total || 0) - Number(inv.amount_paid || 0),
                    )}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Amount</span>
              <input
                type="number"
                step="0.01"
                value={payForm.amount}
                onChange={(e) =>
                  setPayForm((f) => ({ ...f, amount: e.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Date</span>
              <input
                type="date"
                value={payForm.payment_date}
                onChange={(e) =>
                  setPayForm((f) => ({ ...f, payment_date: e.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Method / reference</span>
              <input
                value={payForm.method}
                placeholder="ACH / check #"
                onChange={(e) =>
                  setPayForm((f) => ({ ...f, method: e.target.value }))
                }
              />
            </label>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || !payForm.invoice_id}
              onClick={() => void recordPayment()}
            >
              Record payment
            </button>
          </div>
        </div>
      ) : null}

      <div className="panel" style={{ padding: "0.75rem", overflowX: "auto" }}>
        <strong>Invoices</strong>
        <table className="data-table" style={{ width: "100%", marginTop: "0.5rem" }}>
          <thead>
            <tr>
              <th>Number</th>
              <th>Date</th>
              <th style={{ textAlign: "right" }}>Total</th>
              <th style={{ textAlign: "right" }}>Paid</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td>{inv.invoice_number}</td>
                <td>{inv.invoice_date}</td>
                <td style={{ textAlign: "right" }}>{formatMoney(inv.total)}</td>
                <td style={{ textAlign: "right" }}>
                  {formatMoney(inv.amount_paid)}
                </td>
                <td>
                  <span className="badge badge-neutral">{inv.status}</span>
                </td>
                <td>
                  {canEdit && inv.status === "draft" ? (
                    <button
                      type="button"
                      className="btn"
                      disabled={saving}
                      onClick={() => void markSent(inv.id)}
                    >
                      Mark sent
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div id="ap" className="panel" style={{ padding: "0.75rem" }}>
        <strong>Vendor AP</strong>
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Tracks vendor billed/paid stages. Does not inflate project actual cost
          (PO ledger remains the cost source).
        </p>
        {canManageAp ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "0.5rem",
              marginBottom: "0.75rem",
            }}
          >
            <label className="field">
              <span>PO</span>
              <select
                value={apForm.purchase_order_id}
                onChange={(e) =>
                  setApForm((f) => ({
                    ...f,
                    purchase_order_id: e.target.value,
                  }))
                }
              >
                <option value="">—</option>
                {purchaseOrders.map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.po_number}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Vendor</span>
              <select
                value={apForm.vendor_id}
                onChange={(e) =>
                  setApForm((f) => ({ ...f, vendor_id: e.target.value }))
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
              <span>Amount</span>
              <input
                type="number"
                step="0.01"
                value={apForm.amount}
                onChange={(e) =>
                  setApForm((f) => ({ ...f, amount: e.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Vendor invoice #</span>
              <input
                value={apForm.vendor_invoice_number}
                onChange={(e) =>
                  setApForm((f) => ({
                    ...f,
                    vendor_invoice_number: e.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Bill date</span>
              <input
                type="date"
                value={apForm.bill_date}
                onChange={(e) =>
                  setApForm((f) => ({ ...f, bill_date: e.target.value }))
                }
              />
            </label>
            <div style={{ display: "flex", alignItems: "end" }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={() => void createVendorBill()}
              >
                Add vendor bill
              </button>
            </div>
          </div>
        ) : null}
        <table className="data-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>Vendor inv #</th>
              <th>Date</th>
              <th style={{ textAlign: "right" }}>Amount</th>
              <th style={{ textAlign: "right" }}>Paid</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {vendorBills.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No vendor bills.
                </td>
              </tr>
            ) : (
              vendorBills.map((b) => (
                <tr key={b.id}>
                  <td>{b.vendor_invoice_number || "—"}</td>
                  <td>{b.bill_date || "—"}</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(b.amount)}</td>
                  <td style={{ textAlign: "right" }}>
                    {formatMoney(b.amount_paid)}
                  </td>
                  <td>
                    <span className="badge badge-neutral">{b.status}</span>
                  </td>
                  <td>
                    {canManageAp && b.status !== "paid" && b.status !== "void" ? (
                      <button
                        type="button"
                        className="btn"
                        disabled={saving}
                        onClick={() => void markVendorPaid(b.id, Number(b.amount))}
                      >
                        Mark paid
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
