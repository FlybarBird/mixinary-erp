"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  PO_STATUSES,
  PO_ITEM_STATUSES,
  formatStatusLabel,
  computePoEconomics,
} from "@/lib/projects/procurement";
import { computeBomHeaderEconomics } from "@/lib/projects/bom-header-economics";
import {
  formatPct,
  formatSignedMoney,
} from "@/lib/pricing";
import { useProjectBomSummary } from "@/components/ProjectBomSummaryBar";
import { CurrencyInput } from "@/components/CurrencyInput";
import type {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderProjectLink,
  PoStatus,
  PoItemStatus,
  Vendor,
} from "@/lib/types";

type BomLineSummary = {
  id: string;
  description: string;
  vendor_id: string | null;
  procurement_status: string;
  qty: number;
  qty_ordered: number;
  qty_received: number;
  msrp: number;
  quote: number | null;
  override_pct: number | null;
  estimated_unit_cost: number | null;
};

type OrderRow = PurchaseOrder & {
  items: PurchaseOrderItem[];
  vendors?: {
    id: string;
    code: string;
    name: string;
    contact_name?: string | null;
    contact_email?: string | null;
  } | null;
  is_owner?: boolean;
  is_shared?: boolean;
};

type SplitDialog = {
  sourcePoId: string;
  targetPoId: string;
  itemId: string;
  maxQty: number;
  description: string;
};

type ShareCandidate = { id: string; project_number: string; name: string };

type Props = {
  projectId: string;
  defaultOverridePct: number;
  vendors: Vendor[];
  initialOrders: OrderRow[];
  bomLines: BomLineSummary[];
  canEdit: boolean;
  canReceive: boolean;
  /** Display name for PO email signature */
  signerName?: string | null;
  /** Global CC for PO order mailto links (Admin → Email) */
  poOrderCc?: string | null;
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

function extractEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = String(value).match(/[^\s<>"]+@[^\s<>"]+\.[^\s<>"]+/);
  return match ? match[0] : null;
}

function resolvePoVendorContact(
  po: OrderRow,
  vendors: Vendor[],
): { name: string | null; email: string | null } {
  const fromJoin = po.vendors;
  const fromList = po.vendor_id
    ? vendors.find((v) => v.id === po.vendor_id)
    : undefined;
  const contactName =
    String(fromJoin?.contact_name || fromList?.contact_name || "").trim() ||
    null;
  const contactEmail =
    extractEmail(fromJoin?.contact_email) ||
    extractEmail(fromList?.contact_email) ||
    extractEmail(po.vendor_contact);
  return { name: contactName, email: contactEmail };
}

function buildPoOrderEmail(
  po: OrderRow,
  vendors: Vendor[],
  signerName?: string | null,
  poOrderCc?: string | null,
) {
  const items = po.items.filter((i) => i.item_status !== "cancelled");
  const signature =
    String(signerName || "").trim() || "Mixinary";
  const contact = resolvePoVendorContact(po, vendors);
  const greeting = contact.name ? `Hello ${contact.name},` : "Hello,";

  const itemBlocks =
    items.length > 0
      ? items.flatMap((i, idx) => {
          const name = (i.description || "Item").trim();
          const qty = String(i.qty_ordered ?? 0);
          const sku = (i.vendor_sku || i.sku || "").trim();
          const block = [
            `${idx + 1}. Quantity: ${qty}`,
            sku ? `   SKU: ${sku}` : null,
            `   Name: ${name}`,
          ].filter(Boolean) as string[];
          return idx < items.length - 1 ? [...block, ""] : block;
        })
      : ["(No line items)"];

  const body = [
    greeting,
    "",
    "",
    `Please process the following order for Mixinary PO ${po.po_number}.`,
    "",
    "",
    "Order details:",
    "",
    ...itemBlocks,
    "",
    "",
    "Thank you,",
    "",
    signature,
  ].join("\n");

  const subject = `Mixinary PO ${po.po_number}`;
  const to = contact.email;
  const cc = extractEmail(poOrderCc);

  // mailto URLs break when too long; keep a short body for the link.
  const mailtoBody =
    body.length > 1600
      ? `${body.slice(0, 1600)}\n\n…(truncated)`
      : body;
  const parts = [
    `subject=${encodeURIComponent(subject)}`,
    `body=${encodeURIComponent(mailtoBody)}`,
  ];
  if (cc) parts.push(`cc=${encodeURIComponent(cc)}`);
  const href = `mailto:${to ?? ""}?${parts.join("&")}`;

  return { to, cc, subject, body, href };
}

function DragHandleIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
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
  signerName = null,
  poOrderCc = null,
}: Props) {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderRow[]>(initialOrders);
  const [bomLineState, setBomLineState] = useState<BomLineSummary[]>(bomLines);

  // Keep client state in sync when RSC refresh brings new props
  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders]);

  useEffect(() => {
    setBomLineState(bomLines);
  }, [bomLines]);

  const applyBomPricing = useCallback(
    (
      updates:
        | Array<{
            id: string;
            quote?: number | null;
            estimated_unit_cost?: number | null;
          }>
        | null
        | undefined,
    ) => {
      if (!updates?.length) return;
      const byId = new Map(updates.map((r) => [r.id, r]));
      setBomLineState((prev) =>
        prev.map((line) => {
          const next = byId.get(line.id);
          if (!next) return line;
          return {
            ...line,
            quote: next.quote !== undefined ? next.quote : line.quote,
            estimated_unit_cost:
              next.estimated_unit_cost !== undefined
                ? next.estimated_unit_cost
                : line.estimated_unit_cost,
          };
        }),
      );
    },
    [],
  );

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
    for (const line of bomLineState) map.set(line.id, line);
    return map;
  }, [bomLineState]);

  const headerEconomics = useMemo(() => {
    const purchaseOrders = orders.map((o) => ({
      id: o.id,
      status: o.status,
      shipping: o.shipping,
      tax: o.tax,
    }));
    const poItems = orders.flatMap((o) =>
      o.items.map((item) => ({
        po_id: o.id,
        line_item_id: item.line_item_id,
        qty_ordered: item.qty_ordered,
        unit_price: item.unit_price,
        line_total: item.line_total,
        item_status: item.item_status,
      })),
    );
    return computeBomHeaderEconomics({
      lines: bomLineState,
      purchaseOrders,
      poItems,
      projectDefaultOverridePct: defaultOverridePct,
    });
  }, [orders, bomLineState, defaultOverridePct]);

  const bomSummary = useProjectBomSummary();
  const setBomSummary = bomSummary?.setEconomics;
  useEffect(() => {
    setBomSummary?.(headerEconomics);
  }, [setBomSummary, headerEconomics]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PoStatus | "">("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [collapsedVendors, setCollapsedVendors] = useState<Set<string>>(new Set());

  // PO edit side panel
  const [editingPo, setEditingPo] = useState<OrderRow | null>(null);
  const [editFields, setEditFields] = useState<Partial<PurchaseOrder>>({});
  const [saving, setSaving] = useState(false);

  // New draft PO panel
  const [showNewPo, setShowNewPo] = useState(false);
  const [newPoVendorId, setNewPoVendorId] = useState("");
  const [newPoDate, setNewPoDate] = useState("");
  const [creatingPo, setCreatingPo] = useState(false);
  const [savingItemIds, setSavingItemIds] = useState<Set<string>>(new Set());
  const [dragOverPoId, setDragOverPoId] = useState<string | null>(null);
  const [splitDialog, setSplitDialog] = useState<SplitDialog | null>(null);
  const [splitQty, setSplitQty] = useState("");
  const [moving, setMoving] = useState(false);
  const [renumberValue, setRenumberValue] = useState("");
  const [renumbering, setRenumbering] = useState(false);
  const [poLinks, setPoLinks] = useState<PurchaseOrderProjectLink[]>([]);
  const [shareCandidates, setShareCandidates] = useState<ShareCandidate[]>([]);
  const [shareProjectId, setShareProjectId] = useState("");
  const [sharingBusy, setSharingBusy] = useState(false);

  const notOrderedCount = bomLineState.filter(
    (l) => l.procurement_status === "not_ordered" || l.procurement_status === "partially_ordered",
  ).length;

  const summaryEconomics = useMemo(() => {
    let ordered = 0;
    let sale = 0;
    let profit = 0;
    for (const o of orders) {
      if (o.status === "cancelled") continue;
      const live = livePoEconomics(o, bomById, defaultOverridePct);
      for (const line of live.lines) ordered += line.cost_total;
      sale += live.po.sale_total;
      profit += live.po.profit;
    }
    return {
      ordered,
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

  const lineAllocations = useMemo(() => {
    const map = new Map<string, { total: number; byPo: Map<string, number> }>();
    for (const po of orders) {
      for (const item of po.items) {
        if (!item.line_item_id) continue;
        const qty = Number(item.qty_ordered || 0);
        if (!map.has(item.line_item_id)) {
          map.set(item.line_item_id, { total: 0, byPo: new Map() });
        }
        const entry = map.get(item.line_item_id)!;
        entry.total += qty;
        entry.byPo.set(po.id, (entry.byPo.get(po.id) || 0) + qty);
      }
    }
    return map;
  }, [orders]);

  const loadPoLinks = useCallback(
    async (poId: string) => {
      const res = await fetch(
        `/api/projects/${projectId}/purchase-orders/${poId}/links`,
      );
      if (!res.ok) return;
      const json = await res.json();
      setPoLinks((json.data ?? []) as PurchaseOrderProjectLink[]);
      setShareCandidates((json.shareCandidates ?? []) as ShareCandidate[]);
    },
    [projectId],
  );

  const openPoEdit = (po: OrderRow) => {
    setEditingPo(po);
    setEditFields({
      status: po.status,
      expected_delivery_date: po.expected_delivery_date ?? "",
      vendor_contact: po.vendor_contact ?? "",
      notes: po.notes ?? "",
      shipping: Number(po.shipping || 0),
      tax: Number(po.tax || 0),
    });
    setRenumberValue(po.po_number);
    setShareProjectId("");
    void loadPoLinks(po.id);
  };

  const moveItem = useCallback(
    async (args: {
      sourcePoId: string;
      targetPoId: string;
      itemId: string;
      qty?: number | null;
    }) => {
      setMoving(true);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/purchase-orders/${args.sourcePoId}/items/${args.itemId}/move`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              target_po_id: args.targetPoId,
              qty: args.qty,
            }),
          },
        );
        if (!res.ok) {
          const err = await res.json();
          alert(err.error ?? "Failed to move item");
          return;
        }
        await reloadOrders();
        router.refresh();
      } finally {
        setMoving(false);
        setSplitDialog(null);
        setDragOverPoId(null);
      }
    },
    [projectId, reloadOrders, router],
  );

  const beginDrop = useCallback(
    (targetPoId: string, payload: {
      sourcePoId: string;
      itemId: string;
      qtyOrdered: number;
      description: string;
    }) => {
      if (!canEdit) return;
      if (payload.sourcePoId === targetPoId) return;
      if (payload.qtyOrdered > 1) {
        setSplitDialog({
          sourcePoId: payload.sourcePoId,
          targetPoId,
          itemId: payload.itemId,
          maxQty: payload.qtyOrdered,
          description: payload.description,
        });
        setSplitQty(String(payload.qtyOrdered));
        return;
      }
      void moveItem({
        sourcePoId: payload.sourcePoId,
        targetPoId,
        itemId: payload.itemId,
      });
    },
    [canEdit, moveItem],
  );

  const renumberPo = useCallback(async () => {
    if (!editingPo) return;
    const next = renumberValue.trim();
    if (!next || next === editingPo.po_number) return;
    const previewRes = await fetch(
      `/api/projects/${projectId}/purchase-orders/${editingPo.id}/renumber`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ po_number: next, preview: true }),
      },
    );
    if (!previewRes.ok) {
      const err = await previewRes.json();
      alert(err.error ?? "Preview failed");
      return;
    }
    const preview = await previewRes.json();
    if (preview.data?.clash) {
      alert(`PO number ${next} is already in use`);
      return;
    }
    if (
      !confirm(
        `Renumber ${preview.data.before} → ${preview.data.after}? References and history are preserved.`,
      )
    ) {
      return;
    }
    setRenumbering(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/purchase-orders/${editingPo.id}/renumber`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ po_number: next }),
        },
      );
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Renumber failed");
        return;
      }
      const { data } = await res.json();
      setOrders((prev) =>
        prev.map((o) =>
          o.id === editingPo.id ? { ...o, po_number: data.after } : o,
        ),
      );
      setEditingPo((prev) =>
        prev ? { ...prev, po_number: data.after } : prev,
      );
      router.refresh();
    } finally {
      setRenumbering(false);
    }
  }, [editingPo, renumberValue, projectId, router]);

  const sharePo = useCallback(async () => {
    if (!editingPo || !shareProjectId) return;
    setSharingBusy(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/purchase-orders/${editingPo.id}/links`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: shareProjectId }),
        },
      );
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Share failed");
        return;
      }
      setShareProjectId("");
      await loadPoLinks(editingPo.id);
      await reloadOrders();
    } finally {
      setSharingBusy(false);
    }
  }, [editingPo, shareProjectId, projectId, loadPoLinks, reloadOrders]);

  const unsharePo = useCallback(
    async (linkedProjectId: string) => {
      if (!editingPo) return;
      if (!confirm("Remove this project’s access to the shared PO?")) return;
      setSharingBusy(true);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/purchase-orders/${editingPo.id}/links?project_id=${encodeURIComponent(linkedProjectId)}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const err = await res.json();
          alert(err.error ?? "Unshare failed");
          return;
        }
        await loadPoLinks(editingPo.id);
        await reloadOrders();
      } finally {
        setSharingBusy(false);
      }
    },
    [editingPo, projectId, loadPoLinks, reloadOrders],
  );

  const savePo = useCallback(async () => {
    if (!editingPo) return;
    setSaving(true);
    try {
      // Status changes cascade automatically to items with inherits_po_status.
      const res = await fetch(
        `/api/projects/${projectId}/purchase-orders/${editingPo.id}`,
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
  }, [editingPo, editFields, projectId, router, reloadOrders]);

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
        const { data, poTotals, po, bomPricing } = await res.json();
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
        if (bomPricing) applyBomPricing([bomPricing]);
        router.refresh();
      } finally {
        setSavingItemIds((prev) => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
      }
    },
    [projectId, router, applyBomPricing],
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
          <div className="label">Ordered</div>
          <div className="value">{currencyFmt(summaryEconomics.ordered)}</div>
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
        {(canEdit || canReceive) && (
          <a className="btn" href={`/projects/${projectId}/receive`}>
            QR Receive
          </a>
        )}
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
                  const dropActive = dragOverPoId === po.id;
                  return (
                  <div
                    key={po.id}
                    onDragOver={(e) => {
                      if (!canEdit) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDragOverPoId(po.id);
                    }}
                    onDragLeave={(e) => {
                      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                      setDragOverPoId((cur) => (cur === po.id ? null : cur));
                    }}
                    onDrop={(e) => {
                      if (!canEdit) return;
                      e.preventDefault();
                      try {
                        const raw = e.dataTransfer.getData("application/x-po-item");
                        if (!raw) return;
                        const payload = JSON.parse(raw) as {
                          sourcePoId: string;
                          itemId: string;
                          qtyOrdered: number;
                          description: string;
                        };
                        beginDrop(po.id, payload);
                      } catch {
                        // ignore malformed drag payloads
                      }
                    }}
                    style={{
                      marginBottom: "1rem",
                      border: dropActive
                        ? "2px solid var(--accent)"
                        : "1px solid var(--line)",
                      borderRadius: "var(--radius-sm)",
                      overflow: "hidden",
                      background: dropActive ? "var(--accent-soft)" : undefined,
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
                      {po.is_shared ? (
                        <span
                          className="badge"
                          style={{
                            background: "var(--bg)",
                            border: "1px solid var(--line)",
                            borderRadius: "var(--radius-sm)",
                            padding: "0.1rem 0.45rem",
                            fontSize: "0.7rem",
                            color: "var(--muted)",
                          }}
                          title={
                            po.is_owner === false
                              ? "Shared from another project"
                              : "Shared with other projects"
                          }
                        >
                          {po.is_owner === false ? "Shared in" : "Shared"}
                        </span>
                      ) : null}
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
                        href={buildPoOrderEmail(
                          po,
                          vendors,
                          signerName,
                          poOrderCc,
                        ).href}
                        title={
                          resolvePoVendorContact(po, vendors).email
                            ? `Email order ${po.po_number}`
                            : `Email order ${po.po_number} (set Contact email on the vendor to prefill To:)`
                        }
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
                      {(canEdit || canReceive) && po.items.length > 0 ? (
                        <>
                          <a
                            className="btn btn-ghost"
                            href={`/projects/${projectId}/receive/labels?po=${po.id}&mode=receive`}
                          >
                            Print receive labels
                          </a>
                          <a
                            className="btn btn-ghost"
                            href={`/projects/${projectId}/receive/labels?po=${po.id}&mode=item`}
                          >
                            Print item labels
                          </a>
                        </>
                      ) : null}
                      {canEdit && (
                        <>
                          <button className="btn btn-ghost" onClick={() => openPoEdit(po)}>
                            Edit
                          </button>
                          {po.is_owner !== false && (
                            <button
                              className="btn btn-ghost"
                              style={{ color: "var(--danger)" }}
                              onClick={() => deletePo(po.id)}
                            >
                              Delete
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    {/* Items table */}
                    {po.items.length > 0 && (
                      <div style={{ overflowX: "auto" }}>
                        <table className="bom-table data-table" style={{ fontSize: "0.8rem" }}>
                          <thead>
                            <tr>
                              {canEdit ? <th style={{ width: 28 }} aria-label="Move" /> : null}
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
                              const alloc = item.line_item_id
                                ? lineAllocations.get(item.line_item_id)
                                : undefined;
                              const allocNote =
                                alloc && alloc.byPo.size > 1
                                  ? `${qtyOrdered} here · ${alloc.total} across ${alloc.byPo.size} POs`
                                  : null;

                              return (
                                <tr
                                  key={item.id}
                                  style={{ opacity: saving || moving ? 0.65 : 1 }}
                                >
                                  {canEdit ? (
                                    <td style={{ textAlign: "center", cursor: "grab", color: "var(--muted)" }}>
                                      <span
                                        draggable
                                        title="Drag to another PO (set qty in dialog to split)"
                                        onDragStart={(e) => {
                                          e.dataTransfer.setData(
                                            "application/x-po-item",
                                            JSON.stringify({
                                              sourcePoId: po.id,
                                              itemId: item.id,
                                              qtyOrdered,
                                              description: item.description,
                                            }),
                                          );
                                          e.dataTransfer.effectAllowed = "move";
                                        }}
                                        style={{
                                          display: "inline-flex",
                                          padding: "0.2rem",
                                          userSelect: "none",
                                        }}
                                      >
                                        <DragHandleIcon />
                                      </span>
                                    </td>
                                  ) : null}
                                  <td style={{ padding: "0.3rem 0.5rem" }}>{item.description}</td>
                                  <td style={{ textAlign: "center" }}>{item.sku || "—"}</td>
                                  <td style={{ textAlign: "center" }}>
                                    <div>{qtyOrdered}</div>
                                    {allocNote ? (
                                      <div
                                        style={{
                                          fontSize: "0.65rem",
                                          color: "var(--muted)",
                                          lineHeight: 1.2,
                                        }}
                                        title="Quantity allocated across purchase orders"
                                      >
                                        {allocNote}
                                      </div>
                                    ) : null}
                                  </td>
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
                                      (() => {
                                        const inheriting =
                                          item.inherits_po_status !== false;
                                        const statusLabel = formatStatusLabel(
                                          item.item_status,
                                        );
                                        return (
                                          <select
                                            className="field"
                                            style={{
                                              fontSize: "0.75rem",
                                              padding: "0.15rem 0.35rem",
                                              minWidth: "7.5rem",
                                              color: inheriting
                                                ? "var(--muted)"
                                                : "var(--ink)",
                                              fontWeight: inheriting ? 400 : 700,
                                              background: inheriting
                                                ? "transparent"
                                                : "var(--accent-soft)",
                                              borderColor: inheriting
                                                ? "var(--line)"
                                                : "var(--accent)",
                                            }}
                                            value={
                                              inheriting
                                                ? "__inherit__"
                                                : item.item_status
                                            }
                                            disabled={saving}
                                            aria-label={
                                              inheriting
                                                ? `Status ${statusLabel}, inheriting from PO`
                                                : `Status ${statusLabel}, override`
                                            }
                                            title={
                                              inheriting
                                                ? "Inheriting PO status — pick a status to override"
                                                : "Custom status — choose Inherit to follow the PO again"
                                            }
                                            onChange={(e) => {
                                              const next = e.target.value;
                                              if (next === "__inherit__") {
                                                if (!inheriting) {
                                                  void patchItem(po.id, item.id, {
                                                    inherits_po_status: true,
                                                  });
                                                }
                                                return;
                                              }
                                              void patchItem(po.id, item.id, {
                                                item_status: next as PoItemStatus,
                                                inherits_po_status: false,
                                              });
                                            }}
                                          >
                                            <optgroup label="From PO">
                                              <option value="__inherit__">
                                                {inheriting
                                                  ? statusLabel
                                                  : "Inherit"}
                                              </option>
                                            </optgroup>
                                            <optgroup label="Override">
                                              {PO_ITEM_STATUSES.map((s) => (
                                                <option key={s} value={s}>
                                                  {formatStatusLabel(s)}
                                                </option>
                                              ))}
                                            </optgroup>
                                          </select>
                                        );
                                      })()
                                    ) : (
                                      <span
                                        style={{
                                          fontSize: "0.75rem",
                                          color:
                                            item.inherits_po_status !== false
                                              ? "var(--muted)"
                                              : "var(--ink)",
                                          fontWeight:
                                            item.inherits_po_status !== false
                                              ? 400
                                              : 700,
                                        }}
                                      >
                                        {formatStatusLabel(item.item_status)}
                                      </span>
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
                <div className="label">PO number</div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    className="field"
                    value={renumberValue}
                    onChange={(e) => setRenumberValue(e.target.value)}
                    disabled={renumbering}
                  />
                  <button
                    className="btn"
                    type="button"
                    disabled={
                      renumbering ||
                      !renumberValue.trim() ||
                      renumberValue.trim() === editingPo.po_number
                    }
                    onClick={() => void renumberPo()}
                  >
                    {renumbering ? "…" : "Renumber"}
                  </button>
                </div>
              </label>

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

              <p className="page-sub" style={{ margin: 0, fontSize: "0.8rem" }}>
                Changing PO status updates line items that inherit PO status
                (shown in grey). Pick a status on a line to override, or choose
                Inherit in the status dropdown to follow the PO again.
              </p>

              {editingPo.is_owner !== false ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div className="label">Shared with projects</div>
                  {poLinks.filter((l) => !l.is_owner).length === 0 ? (
                    <p className="page-sub" style={{ margin: 0, fontSize: "0.8rem" }}>
                      Not shared. Linked projects can view and edit this PO.
                    </p>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.85rem" }}>
                      {poLinks
                        .filter((l) => !l.is_owner)
                        .map((l) => (
                          <li
                            key={l.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                              marginBottom: "0.25rem",
                            }}
                          >
                            <span>
                              {l.project
                                ? `${l.project.project_number} — ${l.project.name}`
                                : l.project_id}
                            </span>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ color: "var(--danger)", fontSize: "0.75rem" }}
                              disabled={sharingBusy}
                              onClick={() => void unsharePo(l.project_id)}
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                    </ul>
                  )}
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <select
                      className="field"
                      value={shareProjectId}
                      onChange={(e) => setShareProjectId(e.target.value)}
                      disabled={sharingBusy}
                    >
                      <option value="">Share with project…</option>
                      {shareCandidates.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.project_number} — {p.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn"
                      disabled={!shareProjectId || sharingBusy}
                      onClick={() => void sharePo()}
                    >
                      Share
                    </button>
                  </div>
                </div>
              ) : (
                <p className="page-sub" style={{ margin: 0, fontSize: "0.8rem" }}>
                  This PO is owned by another project. Edits apply everywhere it is shared.
                </p>
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
                <div className="label">Vendor contact override</div>
                <input
                  className="field"
                  placeholder="Uses vendor Contact email if blank"
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

      {splitDialog && (
        <>
          <div
            className="side-panel-backdrop"
            onClick={() => !moving && setSplitDialog(null)}
          />
          <div className="side-panel">
            <div style={{ padding: "1rem", borderBottom: "1px solid var(--line)" }}>
              <strong>Move / split quantity</strong>
              <button
                className="btn btn-ghost"
                style={{ float: "right" }}
                disabled={moving}
                onClick={() => setSplitDialog(null)}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <p className="page-sub" style={{ margin: 0, fontSize: "0.85rem" }}>
                {splitDialog.description}
              </p>
              <p className="page-sub" style={{ margin: 0, fontSize: "0.8rem" }}>
                Enter how many units to move to the target PO. Use the full
                quantity to move the whole line.
              </p>
              <label>
                <div className="label">Quantity to move (max {splitDialog.maxQty})</div>
                <input
                  type="number"
                  className="field"
                  min={1}
                  max={splitDialog.maxQty}
                  step="any"
                  value={splitQty}
                  onChange={(e) => setSplitQty(e.target.value)}
                  disabled={moving}
                />
              </label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  className="btn btn-primary"
                  disabled={moving}
                  onClick={() => {
                    const qty = Number(splitQty);
                    if (!(qty > 0) || qty > splitDialog.maxQty) {
                      alert("Enter a valid quantity");
                      return;
                    }
                    void moveItem({
                      sourcePoId: splitDialog.sourcePoId,
                      targetPoId: splitDialog.targetPoId,
                      itemId: splitDialog.itemId,
                      qty: qty >= splitDialog.maxQty ? null : qty,
                    });
                  }}
                >
                  {moving ? "Moving…" : "Move"}
                </button>
                <button
                  className="btn"
                  disabled={moving}
                  onClick={() => setSplitDialog(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
