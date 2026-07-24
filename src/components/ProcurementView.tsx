"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  PO_STATUSES,
  PO_ITEM_STATUSES,
  formatStatusLabel,
  computePoEconomics,
} from "@/lib/projects/procurement";
import {
  formatPct,
  formatSignedMoney,
} from "@/lib/pricing";
import { CurrencyInput } from "@/components/CurrencyInput";
import type { PurchaseOrder, PurchaseOrderItem, PoStatus, PoItemStatus, Vendor } from "@/lib/types";

type BomLineSummary = {
  id: string;
  description: string;
  vendor_id: string | null;
  procurement_status: string;
  qty: number;
  msrp: number;
  quote: number | null;
  override_pct: number | null;
  estimated_unit_cost: number | null;
};

type OrderRow = PurchaseOrder & {
  items: PurchaseOrderItem[];
  vendors?: { id: string; code: string; name: string } | null;
};

type Props = {
  projectId: string;
  defaultOverridePct: number;
  vendors: Vendor[];
  initialOrders: OrderRow[];
  bomLines: BomLineSummary[];
  canEdit: boolean;
  canReceive: boolean;
};

function varianceStyle(delta: number): { color: string; fontWeight: number } {
  if (delta > 0) return { color: "#e53935", fontWeight: 700 };
  if (delta < 0) return { color: "#00c853", fontWeight: 700 };
  return { color: "#78909c", fontWeight: 650 };
}

/** Profit: positive = green (invert cost-variance coloring). */
function profitStyle(profit: number) {
  return varianceStyle(-profit);
}

function livePoEconomics(
  po: OrderRow,
  bomById: Map<string, BomLineSummary>,
  defaultOverridePct: number,
) {
  return computePoEconomics({
    shipping: Number(po.shipping || 0),
    tax: Number(po.tax || 0),
    items: po.items.map((item) => {
      const bom = item.line_item_id
        ? bomById.get(item.line_item_id)
        : undefined;
      return {
        qty_ordered: Number(item.qty_ordered || 0),
        line_total: Number(item.line_total || 0),
        bom: bom
          ? {
              msrp: bom.msrp,
              quote: bom.quote,
              override_pct: bom.override_pct,
            }
          : null,
      };
    }),
    projectDefaultOverridePct: defaultOverridePct,
  });
}

function currencyFmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function buildPoOrderMailto(po: OrderRow): string {
  const items = po.items.filter((i) => i.item_status !== "cancelled");
  const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);

  const nameLens = items.map((i) => (i.description || "").length);
  const qtyLens = items.map((i) => String(i.qty_ordered ?? 0).length);
  const skuLens = items.map((i) => (i.vendor_sku || i.sku || "").length);

  const nameW = Math.min(48, Math.max(20, 4, ...nameLens));
  const qtyW = Math.max(8, ...qtyLens, 8);
  const skuW = Math.min(24, Math.max(8, 3, ...skuLens));

  const header = `${pad("Name", nameW)}  ${pad("Quantity", qtyW)}  ${pad("SKU", skuW)}`;
  const rule = "-".repeat(header.length);
  const rows =
    items.length > 0
      ? items.map((i) => {
          const name = i.description || "";
          const qty = String(i.qty_ordered ?? 0);
          const sku = i.vendor_sku || i.sku || "";
          return `${pad(name, nameW)}  ${pad(qty, qtyW)}  ${pad(sku, skuW)}`;
        })
      : ["(No line items)"];

  const body = [
    `Hello,`,
    ``,
    `Please process the following order for Mixinary PO ${po.po_number}:`,
    ``,
    header,
    rule,
    ...rows,
    ``,
    `Thank you,`,
    `Mixinary`,
  ].join("\n");

  const subject = `Mixinary :${po.po_number}`;
  const to =
    po.vendor_contact && po.vendor_contact.includes("@")
      ? po.vendor_contact.trim()
      : "";

  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function MailIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 7L2 7" />
    </svg>
  );
}

function isLate(po: PurchaseOrder) {
  if (!po.expected_delivery_date) return false;
  return (
    new Date(po.expected_delivery_date) < new Date() &&
    po.status !== "received" &&
    po.status !== "cancelled" &&
    po.status !== "closed"
  );
}

function isUpcoming(po: PurchaseOrder) {
  if (!po.expected_delivery_date) return false;
  const d = new Date(po.expected_delivery_date);
  const now = new Date();
  const soon = new Date();
  soon.setDate(now.getDate() + 7);
  return d >= now && d <= soon && po.status !== "received" && po.status !== "closed";
}

export function ProcurementView({
  projectId,
  defaultOverridePct,
  vendors,
  initialOrders,
  bomLines,
  canEdit,
  canReceive,
}: Props) {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderRow[]>(initialOrders);

  // Keep client state in sync when RSC refresh brings new props
  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders]);

  const reloadOrders = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/purchase-orders`);
    if (!res.ok) return;
    const json = await res.json();
    if (Array.isArray(json.data)) {
      setOrders(json.data as OrderRow[]);
    }
  }, [projectId]);

  const bomById = useMemo(() => {
    const map = new Map<string, BomLineSummary>();
    for (const line of bomLines) map.set(line.id, line);
    return map;
  }, [bomLines]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PoStatus | "">("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [collapsedVendors, setCollapsedVendors] = useState<Set<string>>(new Set());

  // PO edit side panel
  const [editingPo, setEditingPo] = useState<OrderRow | null>(null);
  const [editFields, setEditFields] = useState<Partial<PurchaseOrder>>({});
  const [cascadeItems, setCascadeItems] = useState(false);
  const [cascadeItemStatus, setCascadeItemStatus] = useState<PoItemStatus>("ordered");
  const [saving, setSaving] = useState(false);

  // New draft PO panel
  const [showNewPo, setShowNewPo] = useState(false);
  const [newPoVendorId, setNewPoVendorId] = useState("");
  const [newPoDate, setNewPoDate] = useState("");
  const [creatingPo, setCreatingPo] = useState(false);
  const [savingItemIds, setSavingItemIds] = useState<Set<string>>(new Set());

  const notOrderedCount = bomLines.filter(
    (l) => l.procurement_status === "not_ordered" || l.procurement_status === "partially_ordered",
  ).length;

  const committed = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((s, o) => s + Number(o.total || 0), 0);

  const summaryEconomics = useMemo(() => {
    let sale = 0;
    let profit = 0;
    for (const o of orders) {
      if (o.status === "cancelled") continue;
      const live = livePoEconomics(o, bomById, defaultOverridePct);
      sale += live.po.sale_total;
      profit += live.po.profit;
    }
    return {
      sale,
      profit,
      margin: sale > 0 ? profit / sale : null,
    };
  }, [orders, bomById, defaultOverridePct]);

  const openOrders = orders.filter(
    (o) => !["received", "closed", "cancelled"].includes(o.status),
  ).length;

  const lateOrders = orders.filter(isLate).length;
  const upcomingDeliveries = orders.filter(isUpcoming).length;

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter && o.status !== statusFilter) return false;
      if (vendorFilter && o.vendor_id !== vendorFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const vendorName = o.vendors?.name?.toLowerCase() ?? "";
        const poNum = (o.po_number ?? "").toLowerCase();
        if (!vendorName.includes(q) && !poNum.includes(q)) return false;
      }
      return true;
    });
  }, [orders, statusFilter, vendorFilter, search]);

  // Group by vendor
  const byVendor = useMemo(() => {
    const map = new Map<string, { vendor: Vendor | undefined; orders: typeof filtered }>();
    for (const o of filtered) {
      const vid = o.vendor_id ?? "__none__";
      if (!map.has(vid)) {
        map.set(vid, {
          vendor: vendors.find((v) => v.id === vid),
          orders: [],
        });
      }
      map.get(vid)!.orders.push(o);
    }
    return map;
  }, [filtered, vendors]);

  const toggleVendor = (vid: string) =>
    setCollapsedVendors((prev) => {
      const next = new Set(prev);
      if (next.has(vid)) next.delete(vid);
      else next.add(vid);
      return next;
    });

  const openPoEdit = (po: (typeof orders)[0]) => {
    setEditingPo(po);
    setEditFields({
      status: po.status,
      expected_delivery_date: po.expected_delivery_date ?? "",
      vendor_contact: po.vendor_contact ?? "",
      notes: po.notes ?? "",
      shipping: Number(po.shipping || 0),
      tax: Number(po.tax || 0),
    });
    setCascadeItems(false);
  };

  const savePo = useCallback(async () => {
    if (!editingPo) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/purchase-orders/${editingPo.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...editFields,
            ...(cascadeItems ? { cascadeItemStatus: true, item_status: cascadeItemStatus } : {}),
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Failed to save");
        return;
      }
      const { data } = await res.json();
      if (data) {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === editingPo.id
              ? { ...o, ...data, items: data.items ?? o.items }
              : o,
          ),
        );
      } else {
        await reloadOrders();
      }
      setEditingPo(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }, [editingPo, editFields, cascadeItems, cascadeItemStatus, projectId, router, reloadOrders]);

  const deletePo = useCallback(async (poId: string) => {
    if (!confirm("Delete this purchase order?")) return;
    const res = await fetch(`/api/projects/${projectId}/purchase-orders/${poId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error ?? "Failed to delete");
      return;
    }
    setOrders((prev) => prev.filter((o) => o.id !== poId));
    router.refresh();
  }, [projectId, router]);

  const createDraftPo = useCallback(async () => {
    if (!newPoVendorId) { alert("Select a vendor"); return; }
    setCreatingPo(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/purchase-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor_id: newPoVendorId,
          order_date: newPoDate || undefined,
          items: [],
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Failed to create PO");
        return;
      }
      await reloadOrders();
      setShowNewPo(false);
      setNewPoVendorId("");
      setNewPoDate("");
      router.refresh();
    } finally {
      setCreatingPo(false);
    }
  }, [newPoVendorId, newPoDate, projectId, router, reloadOrders]);

  const patchItem = useCallback(
    async (poId: string, itemId: string, patch: Partial<PurchaseOrderItem>) => {
      setSavingItemIds((prev) => new Set(prev).add(itemId));
      try {
        const res = await fetch(
          `/api/projects/${projectId}/purchase-orders/${poId}/items/${itemId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          },
        );
        if (!res.ok) {
          const err = await res.json();
          alert(err.error ?? "Failed to save item");
          return;
        }
        const { data, poTotals, po } = await res.json();
        if (po) {
          setOrders((prev) =>
            prev.map((o) => (o.id === poId ? { ...o, ...po, items: po.items ?? o.items } : o)),
          );
        } else {
          setOrders((prev) =>
            prev.map((o) =>
              o.id !== poId
                ? o
                : {
                    ...o,
                    ...(poTotals ?? {}),
                    items: o.items.map((i) => (i.id === itemId ? { ...i, ...data } : i)),
                  },
            ),
          );
        }
        router.refresh();
      } finally {
        setSavingItemIds((prev) => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
      }
    },
    [projectId, router],
  );

  const patchPo = useCallback(
    async (poId: string, patch: Partial<PurchaseOrder>) => {
      const res = await fetch(
        `/api/projects/${projectId}/purchase-orders/${poId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Failed to save PO");
        return;
      }
      const { data } = await res.json();
      setOrders((prev) =>
        prev.map((o) =>
          o.id === poId
            ? { ...o, ...data, items: data.items ?? o.items }
            : o,
        ),
      );
      router.refresh();
    },
    [projectId, router],
  );

  return (
    <div className="stack">
      {/* Summary strip */}
      <div className="workspace-summary">
        <div className="workspace-stat">
          <div className="label">Committed</div>
          <div className="value">{currencyFmt(committed)}</div>
        </div>
        <div className="workspace-stat">
          <div className="label">Sale</div>
          <div className="value">{currencyFmt(summaryEconomics.sale)}</div>
        </div>
        <div className="workspace-stat">
          <div className="label">Profit</div>
          <div className="value" style={profitStyle(summaryEconomics.profit)}>
            {formatSignedMoney(summaryEconomics.profit)}
          </div>
        </div>
        <div className="workspace-stat">
          <div className="label">Margin</div>
          <div className="value">
            {summaryEconomics.margin != null
              ? formatPct(summaryEconomics.margin)
              : "—"}
          </div>
        </div>
        <div className="workspace-stat">
          <div className="label">Open Orders</div>
          <div className="value">{openOrders}</div>
        </div>
        <div className="workspace-stat">
          <div className="label">Late</div>
          <div className="value" style={{ color: lateOrders > 0 ? "var(--danger)" : undefined }}>
            {lateOrders}
          </div>
        </div>
        <div className="workspace-stat">
          <div className="label">BOM Not Ordered</div>
          <div className="value" style={{ color: notOrderedCount > 0 ? "var(--warn)" : undefined }}>
            {notOrderedCount}
          </div>
        </div>
        <div className="workspace-stat">
          <div className="label">Due in 7 Days</div>
          <div className="value">{upcomingDeliveries}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <input
          className="field"
          style={{ maxWidth: 220 }}
          placeholder="Search PO or vendor…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="field"
          style={{ maxWidth: 180 }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as PoStatus | "")}
        >
          <option value="">All statuses</option>
          {PO_STATUSES.map((s) => (
            <option key={s} value={s}>{formatStatusLabel(s)}</option>
          ))}
        </select>
        <select
          className="field"
          style={{ maxWidth: 180 }}
          value={vendorFilter}
          onChange={(e) => setVendorFilter(e.target.value)}
        >
          <option value="">All vendors</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>{v.code} — {v.name}</option>
          ))}
        </select>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setShowNewPo(true)}>
            + New Draft PO
          </button>
        )}
      </div>

      {/* Vendor sections */}
      {byVendor.size === 0 && (
        <p style={{ color: "var(--muted)", padding: "1rem 0" }}>No purchase orders found.</p>
      )}
      {[...byVendor.entries()].map(([vid, { vendor, orders: vOrders }]) => {
        const collapsed = collapsedVendors.has(vid);
        const vendorTotal = vOrders.reduce((s, o) => s + Number(o.total || 0), 0);
        return (
          <div key={vid} className="vendor-section">
            <div
              className="vendor-section-header"
              onClick={() => toggleVendor(vid)}
              style={{ cursor: "pointer" }}
            >
              <strong>{vendor ? `${vendor.code} — ${vendor.name}` : "Unknown Vendor"}</strong>
              <span style={{ marginLeft: "auto", fontSize: "0.85rem", color: "var(--muted)" }}>
                {vOrders.length} PO{vOrders.length !== 1 ? "s" : ""} · {currencyFmt(vendorTotal)}
              </span>
              <span style={{ marginLeft: "0.75rem" }}>{collapsed ? "▶" : "▼"}</span>
            </div>

            {!collapsed && (
              <div style={{ padding: "0.5rem 0.75rem" }}>
                {vOrders.map((po) => {
                  const poEcon = livePoEconomics(po, bomById, defaultOverridePct);
                  return (
                  <div
                    key={po.id}
                    style={{
                      marginBottom: "1rem",
                      border: "1px solid var(--line)",
                      borderRadius: "var(--radius-sm)",
                      overflow: "hidden",
                    }}
                  >
                    {/* PO header row */}
                    <div
                      style={{
                        display: "flex",
                        gap: "0.75rem",
                        alignItems: "center",
                        padding: "0.5rem 0.75rem",
                        background: "var(--bg-soft)",
                        flexWrap: "wrap",
                      }}
                    >
                      <strong style={{ minWidth: 80 }}>{po.po_number}</strong>
                      <span
                        className="badge"
                        style={{
                          background: po.status === "received" ? "var(--ok)" : po.status === "cancelled" ? "var(--line)" : "var(--accent-soft)",
                          color: po.status === "received" ? "#fff" : "var(--ink)",
                          borderRadius: "var(--radius-sm)",
                          padding: "0.1rem 0.45rem",
                          fontSize: "0.75rem",
                        }}
                      >
                        {formatStatusLabel(po.status)}
                      </span>
                      {po.order_date && (
                        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                          Ordered {po.order_date}
                        </span>
                      )}
                      {po.expected_delivery_date && (
                        <span
                          style={{
                            fontSize: "0.8rem",
                            color: isLate(po) ? "var(--danger)" : "var(--muted)",
                          }}
                        >
                          {isLate(po) ? "LATE · " : "Due "}
                          {po.expected_delivery_date}
                        </span>
                      )}
                      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.85rem" }}>
                        <span style={{ color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                          Ship
                          <CurrencyInput
                            value={Number(po.shipping || 0)}
                            disabled={!canEdit}
                            onChange={(value) => {
                              const shipping = value ?? 0;
                              if (shipping === Number(po.shipping || 0)) return;
                              void patchPo(po.id, { shipping });
                            }}
                          />
                        </span>
                        <strong>{currencyFmt(Number(po.total || 0))}</strong>
                        <span style={profitStyle(poEcon.po.profit)}>
                          {formatSignedMoney(poEcon.po.profit)}
                        </span>
                        <span style={{ color: "var(--muted)" }}>
                          {poEcon.po.margin_pct != null
                            ? formatPct(poEcon.po.margin_pct)
                            : "—"}
                        </span>
                      </span>
                      <a
                        className="btn btn-ghost"
                        href={buildPoOrderMailto(po)}
                        title={`Email order ${po.po_number}`}
                        aria-label={`Email order ${po.po_number}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          textDecoration: "none",
                        }}
                      >
                        <MailIcon />
                        Email
                      </a>
                      {canEdit && (
                        <>
                          <button className="btn btn-ghost" onClick={() => openPoEdit(po)}>
                            Edit
                          </button>
                          <button
                            className="btn btn-ghost"
                            style={{ color: "var(--danger)" }}
                            onClick={() => deletePo(po.id)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>

                    {/* Items table */}
                    {po.items.length > 0 && (
                      <div style={{ overflowX: "auto" }}>
                        <table className="bom-table data-table" style={{ fontSize: "0.8rem" }}>
                          <thead>
                            <tr>
                              <th style={{ textAlign: "left", padding: "0.3rem 0.5rem" }}>Description</th>
                              <th>SKU</th>
                              <th>Qty Ord</th>
                              <th>Unit $</th>
                              <th>Total</th>
                              <th>Vs cost</th>
                              <th>Profit</th>
                              <th>Margin</th>
                              <th>Status</th>
                              <th>Tracking</th>
                              <th>Rcvd</th>
                              <th>Exp Del</th>
                            </tr>
                          </thead>
                          <tbody>
                            {po.items.map((item, itemIdx) => {
                              const lineTotal = Number(item.line_total || 0);
                              const bom = item.line_item_id
                                ? bomById.get(item.line_item_id)
                                : undefined;
                              const qtyOrdered = Number(item.qty_ordered || 0);
                              const unitCost = bom
                                ? Number(
                                    bom.estimated_unit_cost ??
                                      bom.quote ??
                                      bom.msrp ??
                                      0,
                                  )
                                : 0;
                              const vsCost = bom
                                ? lineTotal - qtyOrdered * unitCost
                                : null;
                              const liveLine = poEcon.lines[itemIdx]!;
                              const displayProfit = liveLine.profit;
                              const displayMargin = liveLine.margin_pct;
                              const saving = savingItemIds.has(item.id);
                              const canTouchLine = canEdit || canReceive;

                              return (
                                <tr
                                  key={item.id}
                                  style={{ opacity: saving ? 0.65 : 1 }}
                                >
                                  <td style={{ padding: "0.3rem 0.5rem" }}>{item.description}</td>
                                  <td style={{ textAlign: "center" }}>{item.sku || "—"}</td>
                                  <td style={{ textAlign: "center" }}>{item.qty_ordered}</td>
                                  <td style={{ textAlign: "right" }}>
                                    <CurrencyInput
                                      value={Number(item.unit_price || 0)}
                                      disabled={!canEdit}
                                      onChange={(value) => {
                                        const unit_price = value ?? 0;
                                        if (unit_price === Number(item.unit_price || 0)) return;
                                        void patchItem(po.id, item.id, { unit_price });
                                      }}
                                    />
                                  </td>
                                  <td style={{ textAlign: "right" }}>
                                    <CurrencyInput
                                      value={lineTotal}
                                      disabled={!canEdit}
                                      onChange={(value) => {
                                        const next = value ?? 0;
                                        if (next === lineTotal) return;
                                        void patchItem(po.id, item.id, { line_total: next });
                                      }}
                                    />
                                  </td>
                                  <td style={{ textAlign: "right", ...(vsCost != null ? varianceStyle(vsCost) : {}) }}>
                                    {vsCost != null ? formatSignedMoney(vsCost) : "—"}
                                  </td>
                                  <td style={{ textAlign: "right", ...profitStyle(displayProfit) }}>
                                    {formatSignedMoney(displayProfit)}
                                  </td>
                                  <td style={{ textAlign: "right" }}>
                                    {displayMargin != null ? formatPct(displayMargin) : "—"}
                                  </td>

                                  <td style={{ textAlign: "center" }}>
                                    {canTouchLine ? (
                                      <select
                                        className="field"
                                        style={{ fontSize: "0.75rem", padding: "0.15rem" }}
                                        value={item.item_status}
                                        disabled={saving}
                                        onChange={(e) =>
                                          void patchItem(po.id, item.id, {
                                            item_status: e.target.value as PoItemStatus,
                                          })
                                        }
                                      >
                                        {PO_ITEM_STATUSES.map((s) => (
                                          <option key={s} value={s}>{formatStatusLabel(s)}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <span style={{ fontSize: "0.75rem" }}>{formatStatusLabel(item.item_status)}</span>
                                    )}
                                  </td>

                                  <td>
                                    {canTouchLine ? (
                                      <input
                                        className="field"
                                        style={{ fontSize: "0.75rem", padding: "0.15rem", width: 120 }}
                                        placeholder="Tracking #"
                                        defaultValue={item.tracking_number ?? ""}
                                        key={`track-${item.id}-${item.tracking_number ?? ""}`}
                                        disabled={saving}
                                        onBlur={(e) => {
                                          const tracking_number = e.target.value;
                                          if (tracking_number === (item.tracking_number ?? "")) return;
                                          void patchItem(po.id, item.id, { tracking_number });
                                        }}
                                      />
                                    ) : item.tracking_number ? (
                                      item.tracking_url ? (
                                        <a href={item.tracking_url} target="_blank" rel="noreferrer" style={{ fontSize: "0.75rem" }}>
                                          {item.tracking_number}
                                        </a>
                                      ) : (
                                        <span style={{ fontSize: "0.75rem" }}>{item.tracking_number}</span>
                                      )
                                    ) : (
                                      "—"
                                    )}
                                  </td>

                                  <td style={{ textAlign: "center" }}>
                                    {canTouchLine ? (
                                      <input
                                        type="number"
                                        className="field"
                                        style={{ fontSize: "0.75rem", padding: "0.15rem", width: 60 }}
                                        min={0}
                                        defaultValue={item.qty_received ?? 0}
                                        key={`rcvd-${item.id}-${item.qty_received ?? 0}`}
                                        disabled={saving}
                                        onBlur={(e) => {
                                          const qty_received = Number(e.target.value);
                                          if (qty_received === Number(item.qty_received ?? 0)) return;
                                          void patchItem(po.id, item.id, { qty_received });
                                        }}
                                      />
                                    ) : (
                                      `${item.qty_received ?? 0} / ${item.qty_ordered}`
                                    )}
                                  </td>

                                  <td>
                                    {canEdit ? (
                                      <input
                                        type="date"
                                        className="field"
                                        style={{ fontSize: "0.75rem", padding: "0.15rem" }}
                                        value={item.expected_delivery_date ?? ""}
                                        disabled={saving}
                                        onChange={(e) =>
                                          void patchItem(po.id, item.id, {
                                            expected_delivery_date: e.target.value || null,
                                          })
                                        }
                                      />
                                    ) : (
                                      <span style={{ fontSize: "0.75rem" }}>{item.expected_delivery_date ?? "—"}</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Side panel — edit PO */}
      {editingPo && (
        <>
          <div
            className="side-panel-backdrop"
            onClick={() => setEditingPo(null)}
          />
          <div className="side-panel">
            <div style={{ padding: "1rem", borderBottom: "1px solid var(--line)" }}>
              <strong>Edit PO · {editingPo.po_number}</strong>
              <button
                className="btn btn-ghost"
                style={{ float: "right" }}
                onClick={() => setEditingPo(null)}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <label>
                <div className="label">Status</div>
                <select
                  className="field"
                  value={editFields.status ?? editingPo.status}
                  onChange={(e) =>
                    setEditFields((p) => ({ ...p, status: e.target.value as PoStatus }))
                  }
                >
                  {PO_STATUSES.map((s) => (
                    <option key={s} value={s}>{formatStatusLabel(s)}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="checkbox"
                  checked={cascadeItems}
                  onChange={(e) => setCascadeItems(e.target.checked)}
                />
                <span style={{ fontSize: "0.85rem" }}>Cascade status to all items</span>
              </label>

              {cascadeItems && (
                <label>
                  <div className="label">Item Status to Apply</div>
                  <select
                    className="field"
                    value={cascadeItemStatus}
                    onChange={(e) => setCascadeItemStatus(e.target.value as PoItemStatus)}
                  >
                    {PO_ITEM_STATUSES.map((s) => (
                      <option key={s} value={s}>{formatStatusLabel(s)}</option>
                    ))}
                  </select>
                </label>
              )}

              <label>
                <div className="label">Expected Delivery</div>
                <input
                  type="date"
                  className="field"
                  value={editFields.expected_delivery_date ?? ""}
                  onChange={(e) =>
                    setEditFields((p) => ({ ...p, expected_delivery_date: e.target.value }))
                  }
                />
              </label>

              <label>
                <div className="label">Shipping</div>
                <input
                  type="number"
                  className="field"
                  step="0.01"
                  min={0}
                  value={editFields.shipping ?? 0}
                  onChange={(e) =>
                    setEditFields((p) => ({ ...p, shipping: Number(e.target.value) }))
                  }
                />
              </label>

              <label>
                <div className="label">Tax</div>
                <input
                  type="number"
                  className="field"
                  step="0.01"
                  min={0}
                  value={editFields.tax ?? 0}
                  onChange={(e) =>
                    setEditFields((p) => ({ ...p, tax: Number(e.target.value) }))
                  }
                />
              </label>

              <label>
                <div className="label">Vendor Contact</div>
                <input
                  className="field"
                  value={editFields.vendor_contact ?? ""}
                  onChange={(e) =>
                    setEditFields((p) => ({ ...p, vendor_contact: e.target.value }))
                  }
                />
              </label>

              <label>
                <div className="label">Notes</div>
                <textarea
                  className="field"
                  rows={3}
                  value={editFields.notes ?? ""}
                  onChange={(e) =>
                    setEditFields((p) => ({ ...p, notes: e.target.value }))
                  }
                />
              </label>

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button className="btn btn-primary" onClick={savePo} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button className="btn" onClick={() => setEditingPo(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Side panel — new draft PO */}
      {showNewPo && (
        <>
          <div className="side-panel-backdrop" onClick={() => setShowNewPo(false)} />
          <div className="side-panel">
            <div style={{ padding: "1rem", borderBottom: "1px solid var(--line)" }}>
              <strong>New Draft PO</strong>
              <button className="btn btn-ghost" style={{ float: "right" }} onClick={() => setShowNewPo(false)}>
                ✕
              </button>
            </div>
            <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <label>
                <div className="label">Vendor *</div>
                <select
                  className="field"
                  value={newPoVendorId}
                  onChange={(e) => setNewPoVendorId(e.target.value)}
                >
                  <option value="">Select vendor…</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.code} — {v.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <div className="label">Order Date</div>
                <input
                  type="date"
                  className="field"
                  value={newPoDate}
                  onChange={(e) => setNewPoDate(e.target.value)}
                />
              </label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button className="btn btn-primary" onClick={createDraftPo} disabled={creatingPo}>
                  {creatingPo ? "Creating…" : "Create"}
                </button>
                <button className="btn" onClick={() => setShowNewPo(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
