"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PO_ITEM_STATUSES, formatStatusLabel } from "@/lib/projects/procurement";
import type { PurchaseOrderItem, PoItemStatus } from "@/lib/types";

type TrackingItem = PurchaseOrderItem & {
  po_number: string;
  vendor_code: string;
  vendor_name: string;
  vendor_id: string;
  po_id: string;
  line_item_id: string | null;
};

type Props = {
  projectId: string;
  items: TrackingItem[];
  canEdit: boolean;
  canReceive: boolean;
};

const LATE_STATUSES: PoItemStatus[] = ["delayed", "backordered"];
const OVERDUE_STATUSES: PoItemStatus[] = ["ordered", "confirmed", "preparing", "shipped", "in_transit", "out_for_delivery", "partially_received"];

function isOverdue(item: TrackingItem) {
  if (!item.expected_delivery_date) return false;
  return (
    new Date(item.expected_delivery_date) < new Date() &&
    OVERDUE_STATUSES.includes(item.item_status as PoItemStatus)
  );
}

export function TrackingView({ projectId, items, canEdit, canReceive }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [localItems, setLocalItems] = useState(items);
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState<PoItemStatus | "">(
    (searchParams.get("status") as PoItemStatus) ?? "",
  );
  const [vendorFilter, setVendorFilter] = useState(searchParams.get("vendor") ?? "");
  const [delayFilter, setDelayFilter] = useState<"" | "delayed" | "overdue">(
    (searchParams.get("filter") as "" | "delayed" | "overdue") ?? "",
  );

  // Inline receive
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<{
    qty_received: number;
    item_status: PoItemStatus;
    tracking_number: string;
  }>({ qty_received: 0, item_status: "ordered", tracking_number: "" });
  const [saving, setSaving] = useState(false);

  const uniqueVendors = useMemo(() => {
    const seen = new Map<string, string>();
    for (const i of localItems) {
      if (i.vendor_id && !seen.has(i.vendor_id)) {
        seen.set(i.vendor_id, `${i.vendor_code} — ${i.vendor_name}`);
      }
    }
    return [...seen.entries()];
  }, [localItems]);

  const filtered = useMemo(() => {
    return localItems.filter((item) => {
      if (delayFilter === "delayed" && !LATE_STATUSES.includes(item.item_status as PoItemStatus)) return false;
      if (delayFilter === "overdue" && !isOverdue(item)) return false;
      if (statusFilter && item.item_status !== statusFilter) return false;
      if (vendorFilter && item.vendor_id !== vendorFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const match =
          item.description?.toLowerCase().includes(q) ||
          item.po_number?.toLowerCase().includes(q) ||
          item.vendor_name?.toLowerCase().includes(q) ||
          item.tracking_number?.toLowerCase().includes(q) ||
          item.sku?.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [localItems, search, statusFilter, vendorFilter, delayFilter]);

  const startEdit = (item: TrackingItem) => {
    setEditingId(item.id);
    setEditFields({
      qty_received: Number(item.qty_received ?? 0),
      item_status: item.item_status as PoItemStatus,
      tracking_number: item.tracking_number ?? "",
    });
  };

  const saveEdit = useCallback(
    async (item: TrackingItem) => {
      setSaving(true);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/purchase-orders/${item.po_id}/items/${item.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(editFields),
          },
        );
        if (!res.ok) {
          const err = await res.json();
          alert(err.error ?? "Failed to save");
          return;
        }
        const { data } = await res.json();
        setLocalItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, ...data } : i)),
        );
        setEditingId(null);
        router.refresh();
      } finally {
        setSaving(false);
      }
    },
    [editFields, projectId, router],
  );

  const statusColor = (s: string) => {
    if (s === "received") return "var(--ok)";
    if (s === "delayed" || s === "backordered") return "var(--warn)";
    if (s === "cancelled") return "var(--muted)";
    return "var(--accent)";
  };

  return (
    <div className="stack">
      {/* Filters */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <input
          className="field"
          style={{ maxWidth: 220 }}
          placeholder="Search description, PO, tracking…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="field"
          style={{ maxWidth: 160 }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as PoItemStatus | "")}
        >
          <option value="">All statuses</option>
          {PO_ITEM_STATUSES.map((s) => (
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
          {uniqueVendors.map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        <select
          className="field"
          style={{ maxWidth: 150 }}
          value={delayFilter}
          onChange={(e) => setDelayFilter(e.target.value as "" | "delayed" | "overdue")}
        >
          <option value="">All items</option>
          <option value="delayed">Delayed / Backordered</option>
          <option value="overdue">Overdue</option>
        </select>
        <span style={{ marginLeft: "auto", fontSize: "0.8rem", color: "var(--muted)" }}>
          {filtered.length} item{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {filtered.length === 0 && (
        <p style={{ color: "var(--muted)", padding: "1rem 0" }}>No items match the current filters.</p>
      )}

      {filtered.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="bom-table data-table" style={{ fontSize: "0.8rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "0.3rem 0.5rem" }}>Description</th>
                <th>PO #</th>
                <th>Vendor</th>
                <th>SKU</th>
                <th>Status</th>
                <th>Tracking</th>
                <th>Shipped</th>
                <th>Rcvd / Ord</th>
                <th>Exp Del</th>
                <th>BOM Link</th>
                {(canEdit || canReceive) && <th />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const isEditing = editingId === item.id;
                const overdue = isOverdue(item);
                return (
                  <tr key={item.id} style={{ background: overdue ? "color-mix(in srgb, var(--danger) 6%, transparent)" : undefined }}>
                    <td style={{ padding: "0.3rem 0.5rem" }}>{item.description || "—"}</td>
                    <td style={{ textAlign: "center" }}>
                      <a
                        href={`/projects/${projectId}/procurement`}
                        style={{ fontSize: "0.8rem" }}
                      >
                        {item.po_number}
                      </a>
                    </td>
                    <td style={{ fontSize: "0.75rem" }}>
                      {item.vendor_code} {item.vendor_name ? `· ${item.vendor_name}` : ""}
                    </td>
                    <td style={{ textAlign: "center" }}>{item.sku || "—"}</td>

                    {/* Status */}
                    <td style={{ textAlign: "center" }}>
                      {isEditing && (canEdit || canReceive) ? (
                        <select
                          className="field"
                          style={{ fontSize: "0.75rem", padding: "0.15rem" }}
                          value={editFields.item_status}
                          onChange={(e) =>
                            setEditFields((p) => ({ ...p, item_status: e.target.value as PoItemStatus }))
                          }
                        >
                          {PO_ITEM_STATUSES.map((s) => (
                            <option key={s} value={s}>{formatStatusLabel(s)}</option>
                          ))}
                        </select>
                      ) : (
                        <span
                          style={{
                            fontSize: "0.75rem",
                            padding: "0.1rem 0.4rem",
                            borderRadius: "var(--radius-sm)",
                            background: `color-mix(in srgb, ${statusColor(item.item_status)} 15%, transparent)`,
                            color: statusColor(item.item_status),
                          }}
                        >
                          {formatStatusLabel(item.item_status)}
                          {overdue ? " ⚠" : ""}
                        </span>
                      )}
                    </td>

                    {/* Tracking */}
                    <td>
                      {isEditing && (canEdit || canReceive) ? (
                        <input
                          className="field"
                          style={{ fontSize: "0.75rem", padding: "0.15rem", width: 110 }}
                          placeholder="Tracking #"
                          value={editFields.tracking_number}
                          onChange={(e) =>
                            setEditFields((p) => ({ ...p, tracking_number: e.target.value }))
                          }
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

                    <td style={{ textAlign: "center" }}>{item.qty_shipped ?? 0}</td>

                    {/* Qty received */}
                    <td style={{ textAlign: "center" }}>
                      {isEditing && (canEdit || canReceive) ? (
                        <input
                          type="number"
                          className="field"
                          style={{ fontSize: "0.75rem", padding: "0.15rem", width: 60 }}
                          min={0}
                          value={editFields.qty_received}
                          onChange={(e) =>
                            setEditFields((p) => ({ ...p, qty_received: Number(e.target.value) }))
                          }
                        />
                      ) : (
                        `${item.qty_received ?? 0} / ${item.qty_ordered}`
                      )}
                    </td>

                    <td style={{ textAlign: "center", fontSize: "0.75rem" }}>
                      {item.expected_delivery_date ?? "—"}
                    </td>

                    {/* BOM link */}
                    <td style={{ textAlign: "center" }}>
                      {item.line_item_id ? (
                        <a
                          href={`/projects/${projectId}?line=${item.line_item_id}`}
                          style={{ fontSize: "0.75rem" }}
                        >
                          BOM ↗
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>

                    {(canEdit || canReceive) && (
                      <td style={{ textAlign: "center" }}>
                        {isEditing ? (
                          <span style={{ display: "flex", gap: "0.25rem" }}>
                            <button
                              className="btn btn-primary"
                              style={{ fontSize: "0.7rem", padding: "0.15rem 0.5rem" }}
                              disabled={saving}
                              onClick={() => saveEdit(item)}
                            >
                              {saving ? "…" : "Save"}
                            </button>
                            <button
                              className="btn btn-ghost"
                              style={{ fontSize: "0.7rem", padding: "0.15rem 0.4rem" }}
                              onClick={() => setEditingId(null)}
                            >
                              ✕
                            </button>
                          </span>
                        ) : (
                          <button
                            className="btn btn-ghost"
                            style={{ fontSize: "0.7rem", padding: "0.15rem 0.4rem" }}
                            onClick={() => startEdit(item)}
                          >
                            Receive
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
