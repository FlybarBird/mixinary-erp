"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ProjectInvoice,
  ProjectPayment,
  VendorBill,
  VendorBillStatus,
} from "@/lib/types";
import { formatMoney } from "@/lib/pricing";
import { CurrencyInput } from "@/components/CurrencyInput";
import {
  useProjectBillingSummary,
  useProjectBomSummary,
} from "@/components/ProjectBomSummaryBar";
import { sumBilledInvoices } from "@/lib/projects/billing-totals";

interface Props {
  projectId: string;
  initialInvoices: ProjectInvoice[];
  initialPayments: ProjectPayment[];
  initialVendorBills: VendorBill[];
  purchaseOrders: {
    id: string;
    po_number: string;
    vendor_id: string | null;
    total?: number | null;
  }[];
  vendors: { id: string; name: string }[];
  canEdit: boolean;
  canManageAp: boolean;
}

function quoteAmountNumber(totalQuote: number) {
  if (!Number.isFinite(totalQuote) || totalQuote <= 0) return null;
  return Math.round(totalQuote * 100) / 100;
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
  const bomSummary = useProjectBomSummary();
  const defaultInvoiceAmount = quoteAmountNumber(
    (bomSummary?.economics.totalQuote ?? 0) +
      (bomSummary?.labor.totalQuote ?? 0),
  );

  const [invoices, setInvoices] = useState(initialInvoices);
  const [payments, setPayments] = useState(initialPayments);
  const [vendorBills, setVendorBills] = useState(initialVendorBills);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [invForm, setInvForm] = useState<{
    description: string;
    amount: number | null;
    tax: number | null;
    due_date: string;
    send: boolean;
  }>({
    description: "Progress billing",
    amount: null,
    tax: null,
    due_date: "",
    send: false,
  });

  useEffect(() => {
    if (defaultInvoiceAmount == null) return;
    setInvForm((f) =>
      f.amount == null ? { ...f, amount: defaultInvoiceAmount } : f,
    );
  }, [defaultInvoiceAmount]);
  const [payForm, setPayForm] = useState({
    invoice_id: "",
    amount: "",
    payment_date: new Date().toISOString().slice(0, 10),
    method: "",
    reference: "",
  });
  const [apForm, setApForm] = useState<{
    purchase_order_id: string;
    vendor_id: string;
    vendor_invoice_number: string;
    amount: number | null;
    bill_date: string;
    status: VendorBillStatus;
  }>({
    purchase_order_id: "",
    vendor_id: "",
    vendor_invoice_number: "",
    amount: null,
    bill_date: new Date().toISOString().slice(0, 10),
    status: "billed",
  });

  const summary = useMemo(() => {
    const billed = sumBilledInvoices(invoices);
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

  const billingSummary = useProjectBillingSummary();
  const setBilled = billingSummary?.setBilled;
  useEffect(() => {
    setBilled?.(summary.billed);
  }, [summary.billed, setBilled]);

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
      amount: defaultInvoiceAmount,
      tax: null,
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
    setApForm((f) => ({
      ...f,
      vendor_invoice_number: "",
      amount: null,
    }));
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
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "0.75rem",
        }}
      >
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
            padding: 0,
            display: "grid",
            gridTemplateColumns: "1.15fr 1fr",
            overflow: "hidden",
          }}
        >
          <div
            className="stack"
            style={{
              gap: "0.65rem",
              padding: "1rem 1.1rem",
              borderRight: "1px solid var(--line)",
            }}
          >
            <strong style={{ fontSize: "0.95rem" }}>New invoice</strong>
            <label>
              <span className="label">Description</span>
              <input
                className="field"
                value={invForm.description}
                placeholder="Progress billing"
                onChange={(e) =>
                  setInvForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "0.65rem",
              }}
            >
              <label>
                <span className="label">Amount</span>
                <CurrencyInput
                  className="field"
                  value={invForm.amount}
                  allowEmpty
                  onChange={(amount) => setInvForm((f) => ({ ...f, amount }))}
                />
              </label>
              <label>
                <span className="label">Tax</span>
                <CurrencyInput
                  className="field"
                  value={invForm.tax}
                  allowEmpty
                  onChange={(tax) => setInvForm((f) => ({ ...f, tax }))}
                />
              </label>
              <label>
                <span className="label">Due date</span>
                <input
                  className="field"
                  type="date"
                  value={invForm.due_date}
                  onChange={(e) =>
                    setInvForm((f) => ({ ...f, due_date: e.target.value }))
                  }
                />
              </label>
            </div>
            <label
              className="row"
              style={{ gap: "0.45rem", alignItems: "center", marginTop: "0.15rem" }}
            >
              <input
                type="checkbox"
                checked={invForm.send}
                onChange={(e) =>
                  setInvForm((f) => ({ ...f, send: e.target.checked }))
                }
              />
              <span style={{ fontSize: "0.9rem" }}>Mark as sent</span>
            </label>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
              onClick={() => void createInvoice()}
              style={{ alignSelf: "start", marginTop: "0.15rem" }}
            >
              Create invoice
            </button>
          </div>

          <div
            className="stack"
            style={{
              gap: "0.65rem",
              padding: "1rem 1.1rem",
              background: "var(--bg-soft)",
            }}
          >
            <strong style={{ fontSize: "0.95rem" }}>Record payment</strong>
            <label>
              <span className="label">Apply to invoice</span>
              <select
                className="field"
                value={payForm.invoice_id}
                onChange={(e) =>
                  setPayForm((f) => ({ ...f, invoice_id: e.target.value }))
                }
              >
                <option value="">Select invoice…</option>
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.65rem",
              }}
            >
              <label>
                <span className="label">Amount</span>
                <input
                  className="field"
                  type="number"
                  step="0.01"
                  value={payForm.amount}
                  onChange={(e) =>
                    setPayForm((f) => ({ ...f, amount: e.target.value }))
                  }
                />
              </label>
              <label>
                <span className="label">Date</span>
                <input
                  className="field"
                  type="date"
                  value={payForm.payment_date}
                  onChange={(e) =>
                    setPayForm((f) => ({ ...f, payment_date: e.target.value }))
                  }
                />
              </label>
            </div>
            <label>
              <span className="label">Method / reference</span>
              <input
                className="field"
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
              style={{ alignSelf: "start", marginTop: "0.15rem" }}
            >
              Record payment
            </button>
          </div>
        </div>
      ) : null}

      <div className="panel" style={{ padding: "0.85rem 1rem" }}>
        <strong style={{ fontSize: "0.95rem" }}>Invoices</strong>
        {invoices.length === 0 ? (
          <p className="muted" style={{ margin: "0.65rem 0 0", fontSize: "0.85rem" }}>
            No invoices yet.
          </p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: "0.65rem" }}>
            <table
              className="bom-table data-table"
              style={{ width: "100%", fontSize: "0.85rem" }}
            >
              <thead>
                <tr>
                  <th style={{ width: "18%" }}>Number</th>
                  <th style={{ width: "14%" }}>Date</th>
                  <th style={{ width: "14%", textAlign: "right" }}>Total</th>
                  <th style={{ width: "14%", textAlign: "right" }}>Paid</th>
                  <th style={{ width: "14%" }}>Status</th>
                  <th style={{ width: "26%", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <strong>{inv.invoice_number}</strong>
                    </td>
                    <td>{inv.invoice_date}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {formatMoney(inv.total)}
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {formatMoney(inv.amount_paid)}
                    </td>
                    <td>
                      <span
                        className={`badge badge-${
                          inv.status === "paid"
                            ? "green"
                            : inv.status === "draft"
                              ? "draft"
                              : inv.status === "void"
                                ? "neutral"
                                : "blue"
                        }`}
                      >
                        {String(inv.status).replace(/_/g, " ")}
                      </span>
                    </td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          gap: "0.4rem",
                          justifyContent: "flex-end",
                          flexWrap: "wrap",
                        }}
                      >
                        <a
                          className="btn"
                          href={`/api/projects/${projectId}/invoices/${inv.id}/pdf`}
                          download
                        >
                          PDF
                        </a>
                        {canEdit && inv.status === "draft" ? (
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={saving}
                            onClick={() => void markSent(inv.id)}
                          >
                            Mark sent
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div id="ap" className="panel" style={{ padding: "0.85rem 1rem" }}>
        <strong style={{ fontSize: "0.95rem" }}>Vendor AP</strong>
        <p className="muted" style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
          Tracks vendor billed/paid stages. Does not inflate project actual cost
          (PO ledger remains the cost source).
        </p>

        {canManageAp ? (
          <div
            className="stack"
            style={{
              gap: "0.65rem",
              marginTop: "0.85rem",
              marginBottom: "1rem",
              padding: "0.85rem",
              background: "var(--bg-soft)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--line)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.1fr 1.2fr 0.9fr",
                gap: "0.65rem",
              }}
            >
              <label>
                <span className="label">PO</span>
                <select
                  className="field"
                  value={apForm.purchase_order_id}
                  onChange={(e) => {
                    const purchase_order_id = e.target.value;
                    const po = purchaseOrders.find(
                      (p) => p.id === purchase_order_id,
                    );
                    setApForm((f) => ({
                      ...f,
                      purchase_order_id,
                      vendor_id: po?.vendor_id ?? "",
                      amount:
                        po != null && Number(po.total || 0) > 0
                          ? Math.round(Number(po.total) * 100) / 100
                          : null,
                    }));
                  }}
                >
                  <option value="">Select PO…</option>
                  {purchaseOrders.map((po) => (
                    <option key={po.id} value={po.id}>
                      {po.po_number}
                      {po.total != null
                        ? ` · ${formatMoney(Number(po.total || 0))}`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">Vendor</span>
                <select
                  className="field"
                  value={apForm.vendor_id}
                  onChange={(e) =>
                    setApForm((f) => ({ ...f, vendor_id: e.target.value }))
                  }
                >
                  <option value="">Select vendor…</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">Amount</span>
                <CurrencyInput
                  className="field"
                  value={apForm.amount}
                  allowEmpty
                  onChange={(amount) => setApForm((f) => ({ ...f, amount }))}
                />
              </label>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 0.9fr auto",
                gap: "0.65rem",
                alignItems: "end",
              }}
            >
              <label>
                <span className="label">Vendor invoice #</span>
                <input
                  className="field"
                  value={apForm.vendor_invoice_number}
                  placeholder="Optional"
                  onChange={(e) =>
                    setApForm((f) => ({
                      ...f,
                      vendor_invoice_number: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span className="label">Bill date</span>
                <input
                  className="field"
                  type="date"
                  value={apForm.bill_date}
                  onChange={(e) =>
                    setApForm((f) => ({ ...f, bill_date: e.target.value }))
                  }
                />
              </label>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving || apForm.amount == null || apForm.amount <= 0}
                onClick={() => void createVendorBill()}
              >
                Add vendor bill
              </button>
            </div>
          </div>
        ) : null}

        {vendorBills.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            No vendor bills yet.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              className="bom-table data-table"
              style={{ width: "100%", fontSize: "0.85rem" }}
            >
              <thead>
                <tr>
                  <th style={{ width: "22%" }}>Vendor inv #</th>
                  <th style={{ width: "14%" }}>Date</th>
                  <th style={{ width: "14%", textAlign: "right" }}>Amount</th>
                  <th style={{ width: "14%", textAlign: "right" }}>Paid</th>
                  <th style={{ width: "16%" }}>Status</th>
                  <th style={{ width: "20%", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {vendorBills.map((b) => (
                  <tr key={b.id}>
                    <td>{b.vendor_invoice_number || "—"}</td>
                    <td>{b.bill_date || "—"}</td>
                    <td
                      style={{
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatMoney(b.amount)}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatMoney(b.amount_paid)}
                    </td>
                    <td>
                      <span
                        className={`badge badge-${
                          b.status === "paid"
                            ? "green"
                            : b.status === "void"
                              ? "neutral"
                              : "blue"
                        }`}
                      >
                        {String(b.status).replace(/_/g, " ")}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {canManageAp &&
                      b.status !== "paid" &&
                      b.status !== "void" ? (
                        <button
                          type="button"
                          className="btn"
                          disabled={saving}
                          onClick={() =>
                            void markVendorPaid(b.id, Number(b.amount))
                          }
                        >
                          Mark paid
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
