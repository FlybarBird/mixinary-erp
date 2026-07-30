"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  calculateLinePricing,
  formatMoney,
  formatSignedMoney,
  outOfPocketStyle,
} from "@/lib/pricing";
import { computeBomHeaderEconomics } from "@/lib/projects/bom-header-economics";
import type {
  CatalogPart,
  LineItem,
  OrderStatus,
  ProjectSection,
  Vendor,
} from "@/lib/types";
import { CurrencyInput } from "@/components/CurrencyInput";
import { PartPickerModal } from "@/components/PartPickerModal";
import { AttachmentsPanel } from "@/components/AttachmentsPanel";
import { useProjectBomSummary } from "@/components/ProjectBomSummaryBar";
import { useDebouncedAutosave } from "@/lib/hooks/useDebouncedAutosave";

type EditableLine = LineItem & { _key: string };

type BomBulkField =
  | "description"
  | "sku"
  | "category"
  | "qty"
  | "override_pct"
  | "vendor_id"
  | "required_by_date"
  | "order_status"
  | "tracking"
  | "notes"
  | "section_id";

const BOM_BULK_ALWAYS: Array<{ value: BomBulkField; label: string }> = [
  { value: "order_status", label: "Order status" },
  { value: "tracking", label: "Tracking" },
  { value: "notes", label: "Notes" },
];

const BOM_BULK_PRICING: Array<{ value: BomBulkField; label: string }> = [
  { value: "description", label: "Description" },
  { value: "sku", label: "SKU" },
  { value: "category", label: "Category" },
  { value: "qty", label: "Qty" },
  { value: "override_pct", label: "Override %" },
  { value: "vendor_id", label: "Vendor" },
  { value: "required_by_date", label: "Required by" },
  { value: "section_id", label: "Section" },
];

type HeaderPo = {
  id: string;
  status: string;
  shipping?: number | null;
  tax?: number | null;
};
type HeaderPoItem = {
  po_id: string;
  line_item_id?: string | null;
  qty_ordered?: number | null;
  unit_price?: number | null;
  line_total?: number | null;
  item_status?: string | null;
};

export function BomEditor({
  projectId,
  defaultOverridePct,
  initialSections,
  initialLines,
  vendors,
  purchaseOrders = [],
  poItems = [],
  canEditPricing,
}: {
  projectId: string;
  defaultOverridePct: number;
  initialSections: ProjectSection[];
  initialLines: LineItem[];
  vendors: Vendor[];
  purchaseOrders?: HeaderPo[];
  poItems?: HeaderPoItem[];
  canEditPricing: boolean;
}) {
  const router = useRouter();
  const [sections, setSections] = useState(initialSections);
  const [lines, setLines] = useState<EditableLine[]>(
    initialLines.map((l) => ({ ...l, _key: l.id })),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [productUrl, setProductUrl] = useState("");
  const [pickerSectionId, setPickerSectionId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    key: string;
    place: "before" | "after";
  } | null>(null);
  const [bulkField, setBulkField] = useState<BomBulkField | "">("");
  const [bulkValue, setBulkValue] = useState("");

  const bump = useCallback(() => setRevision((r) => r + 1), []);

  const bulkFields = useMemo(
    () =>
      canEditPricing
        ? [...BOM_BULK_PRICING, ...BOM_BULK_ALWAYS]
        : BOM_BULK_ALWAYS,
    [canEditPricing],
  );

  const priced = useMemo(
    () =>
      lines.map((line) =>
        calculateLinePricing({
          qty: line.qty,
          msrp: line.msrp,
          quote: line.quote,
          overridePct: line.override_pct,
          projectDefaultOverridePct: defaultOverridePct,
        }),
      ),
    [lines, defaultOverridePct],
  );
  const headerEconomics = useMemo(
    () =>
      computeBomHeaderEconomics({
        lines,
        purchaseOrders,
        poItems,
        projectDefaultOverridePct: defaultOverridePct,
      }),
    [lines, purchaseOrders, poItems, defaultOverridePct],
  );
  const bomSummary = useProjectBomSummary();
  const setBomSummary = bomSummary?.setEconomics;
  useEffect(() => {
    setBomSummary?.(headerEconomics);
  }, [setBomSummary, headerEconomics]);

  const sectionMap = useMemo(
    () => new Map(sections.map((s) => [s.id, s])),
    [sections],
  );

  const grouped = useMemo(() => {
    const unsorted = lines.filter(
      (l) => !l.section_id || !sectionMap.has(l.section_id),
    );
    return [
      ...sections
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((section) => ({
          section,
          lines: lines
            .filter((l) => l.section_id === section.id)
            .sort((a, b) => a.sort_order - b.sort_order),
        })),
      ...(unsorted.length
        ? [{ section: null as ProjectSection | null, lines: unsorted }]
        : []),
    ];
  }, [lines, sections, sectionMap]);

  const allLineIds = useMemo(() => lines.map((l) => l.id), [lines]);
  const allSelected =
    allLineIds.length > 0 && allLineIds.every((id) => selected.has(id));
  const someSelected =
    !allSelected && allLineIds.some((id) => selected.has(id));

  function updateLine(key: string, patch: Partial<LineItem>) {
    setLines((prev) =>
      prev.map((line) => (line._key === key ? { ...line, ...patch } : line)),
    );
    bump();
  }

  function bulkUpdateSelected() {
    if (!selected.size || !bulkField) return;
    if (!bulkFields.some((f) => f.value === bulkField)) return;

    let patch: Partial<LineItem> | null = null;
    switch (bulkField) {
      case "description":
        patch = { description: bulkValue.trim() || "New item" };
        break;
      case "sku":
        patch = { sku: bulkValue.trim() || null };
        break;
      case "category":
        patch = { category: bulkValue.trim() || null };
        break;
      case "qty": {
        const qty = Math.max(0, Number(bulkValue) || 0);
        patch = { qty };
        break;
      }
      case "override_pct":
        patch = {
          override_pct:
            bulkValue === "" ? null : (Number(bulkValue) || 0) / 100,
        };
        break;
      case "vendor_id":
        patch = { vendor_id: bulkValue || null };
        break;
      case "required_by_date":
        patch = { required_by_date: bulkValue || null };
        break;
      case "order_status":
        if (!["none", "ordered", "shipped"].includes(bulkValue)) return;
        patch = { order_status: bulkValue as OrderStatus };
        break;
      case "tracking":
        patch = { tracking: bulkValue.trim() || null };
        break;
      case "notes":
        patch = { notes: bulkValue.trim() || null };
        break;
      case "section_id":
        patch = { section_id: bulkValue || null };
        break;
      default:
        return;
    }

    const nextPatch = patch;
    setLines((prev) =>
      prev.map((line) =>
        selected.has(line.id) ? { ...line, ...nextPatch } : line,
      ),
    );
    bump();
    setMessage(
      `Updated ${bulkField.replace(/_/g, " ")} on ${selected.size} line${selected.size === 1 ? "" : "s"}`,
    );
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      if (allLineIds.length > 0 && allLineIds.every((id) => prev.has(id))) {
        return new Set();
      }
      return new Set(allLineIds);
    });
  }

  function toggleSelectSection(sectionLines: EditableLine[]) {
    const ids = sectionLines.map((l) => l.id);
    if (!ids.length) return;
    setSelected((prev) => {
      const allOn = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allOn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function visualOrderKeys(source: EditableLine[]) {
    const map = new Map(sections.map((s) => [s.id, s]));
    const unsorted = source.filter(
      (l) => !l.section_id || !map.has(l.section_id),
    );
    return [
      ...sections
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .flatMap((section) =>
          source
            .filter((l) => l.section_id === section.id)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((l) => l._key),
        ),
      ...unsorted
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((l) => l._key),
    ];
  }

  function reorderLine(
    fromKey: string,
    targetKey: string,
    place: "before" | "after",
  ) {
    if (fromKey === targetKey) return;
    setLines((prev) => {
      const byKey = new Map(prev.map((l) => [l._key, l]));
      const drag = byKey.get(fromKey);
      const target = byKey.get(targetKey);
      if (!drag || !target) return prev;

      const ordered = visualOrderKeys(prev).filter((k) => k !== fromKey);
      let insertAt = ordered.indexOf(targetKey);
      if (insertAt < 0) return prev;
      if (place === "after") insertAt += 1;
      ordered.splice(insertAt, 0, fromKey);

      return ordered.map((key, index) => {
        const line = byKey.get(key)!;
        if (key === fromKey) {
          return {
            ...line,
            section_id: target.section_id,
            sort_order: index,
          };
        }
        return { ...line, sort_order: index };
      });
    });
    bump();
  }

  function moveLineToSection(fromKey: string, sectionId: string | null) {
    setLines((prev) => {
      const byKey = new Map(prev.map((l) => [l._key, l]));
      const drag = byKey.get(fromKey);
      if (!drag) return prev;

      const ordered = visualOrderKeys(prev).filter((k) => k !== fromKey);
      const sectionKeys = ordered.filter((key) => {
        const line = byKey.get(key)!;
        if (sectionId == null) {
          return !line.section_id || !sectionMap.has(line.section_id);
        }
        return line.section_id === sectionId;
      });
      const lastInSection = sectionKeys[sectionKeys.length - 1];
      let insertAt = lastInSection ? ordered.indexOf(lastInSection) + 1 : 0;
      if (!lastInSection && sectionId) {
        const sectionIndex = sections
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .findIndex((s) => s.id === sectionId);
        const priorSectionIds = new Set(
          sections
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order)
            .slice(0, Math.max(0, sectionIndex))
            .map((s) => s.id),
        );
        insertAt = ordered.filter((key) =>
          priorSectionIds.has(byKey.get(key)?.section_id ?? ""),
        ).length;
      }
      ordered.splice(insertAt, 0, fromKey);

      return ordered.map((key, index) => {
        const line = byKey.get(key)!;
        if (key === fromKey) {
          return { ...line, section_id: sectionId, sort_order: index };
        }
        return { ...line, sort_order: index };
      });
    });
    bump();
  }

  function onLineDragStart(e: DragEvent, key: string) {
    if (!canEditPricing) return;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", key);
    setDragKey(key);
  }

  function onLineDragOver(e: DragEvent, key: string) {
    if (!canEditPricing || !dragKey || dragKey === key) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const place = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
    setDropTarget({ key, place });
  }

  function onLineDrop(e: DragEvent, key: string) {
    e.preventDefault();
    if (!canEditPricing) return;
    const fromKey = e.dataTransfer.getData("text/plain") || dragKey;
    if (!fromKey) return;
    const place =
      dropTarget?.key === key
        ? dropTarget.place
        : (() => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
          })();
    reorderLine(fromKey, key, place);
    setDragKey(null);
    setDropTarget(null);
  }

  function onSectionDragOver(e: DragEvent) {
    if (!canEditPricing || !dragKey) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function onSectionDrop(e: DragEvent, sectionId: string | null) {
    e.preventDefault();
    if (!canEditPricing) return;
    const fromKey = e.dataTransfer.getData("text/plain") || dragKey;
    if (!fromKey) return;
    moveLineToSection(fromKey, sectionId);
    setDragKey(null);
    setDropTarget(null);
  }

  function onDragEnd() {
    setDragKey(null);
    setDropTarget(null);
  }

  function addLine(
    sectionId: string | null,
    prefill?: Partial<LineItem> & { qty?: number },
  ) {
    const key = `new-${crypto.randomUUID()}`;
    setLines((prev) => [
      ...prev,
      {
        _key: key,
        id: key,
        project_id: projectId,
        section_id: sectionId,
        sort_order: prev.length,
        description: "New item",
        sku: null,
        category: null,
        uom: "ea",
        qty: 1,
        msrp: 0,
        quote: null,
        override_pct: null,
        estimated_unit_cost: null,
        required_by_date: null,
        procurement_status: "not_ordered",
        qty_ordered: 0,
        qty_received: 0,
        vendor_id: null,
        catalog_part_id: null,
        order_status: "none",
        tracking: null,
        carrier_id: null,
        notes: null,
        fetch_error: null,
        msrp_source_url: null,
        msrp_fetched_at: null,
        ...prefill,
      },
    ]);
    bump();
  }

  function openPicker(sectionId: string | null) {
    setPickerSectionId(sectionId);
    setPickerOpen(true);
  }

  function addFromCatalog(items: Array<{ part: CatalogPart; qty: number }>) {
    for (const { part, qty } of items) {
      addLine(pickerSectionId, {
        description: part.name,
        sku: part.sku,
        qty,
        msrp: Number(part.msrp || 0),
        quote: part.default_quote,
        vendor_id: part.default_vendor_id,
        catalog_part_id: part.id,
        notes: part.description,
      });
    }
    setMessage(
      `Added ${items.length} catalog part${items.length === 1 ? "" : "s"}`,
    );
  }

  function addSection() {
    const name = prompt("Section name");
    if (!name) return;
    const id = `new-section-${crypto.randomUUID()}`;
    setSections((prev) => [
      ...prev,
      {
        id,
        project_id: projectId,
        name,
        sort_order: prev.length,
      },
    ]);
    bump();
  }

  async function sendToProcurement() {
    const ids = [...selected].filter((id) => !String(id).startsWith("new-"));
    if (!ids.length) {
      setMessage("Select saved BOM lines first (save if new)");
      return;
    }
    setMessage("Creating purchase orders…");
    const res = await fetch(`/api/projects/${projectId}/procurement/from-bom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineItemIds: ids }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Failed to send to procurement");
      return;
    }
    const warn =
      Array.isArray(data.warnings) && data.warnings.length
        ? ` · ${data.warnings.length} warning(s)`
        : "";
    setMessage(
      `Created ${data.created ?? data.orders?.length ?? 0} PO(s)${warn}`,
    );
    router.push(`/projects/${projectId}/procurement`);
    router.refresh();
  }

  const save = useCallback(async () => {
    setMessage(null);
    const orderedLines = visualOrderKeys(lines)
      .map((key) => lines.find((l) => l._key === key)!)
      .filter(Boolean)
      .map((line, index) => ({ ...line, sort_order: index }));
    const res = await fetch(`/api/projects/${projectId}/bom`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections, lines: orderedLines }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Save failed");
      throw new Error(data.error || "Save failed");
    }
    if (Array.isArray(data.sections)) {
      setSections(data.sections as ProjectSection[]);
    }
    if (Array.isArray(data.lines)) {
      setLines(
        (data.lines as LineItem[]).map((l) => ({ ...l, _key: l.id })),
      );
      setSelected(new Set());
    }
    router.refresh();
  }, [lines, sections, projectId, router]);

  useDebouncedAutosave({
    revision,
    enabled: true,
    delayMs: 900,
    save,
  });

  async function refreshMsrp() {
    const ids = [...selected];
    if (!ids.length) {
      setMessage("Select one or more lines first");
      return;
    }
    setMessage("Starting MSRP fetch…");
    const res = await fetch("/api/msrp/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        lineItemIds: ids,
        productUrl: productUrl || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "MSRP fetch failed");
      return;
    }
    router.push(`/review/${data.jobId}`);
  }

  async function uploadQuote(file: File | null) {
    if (!file) return;
    setMessage("Uploading quote…");
    const form = new FormData();
    form.set("projectId", projectId);
    form.set("file", file);
    const res = await fetch("/api/quotes/upload", {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Quote upload failed");
      return;
    }
    router.push(`/review/${data.jobId}`);
  }

  return (
    <div className="stack">
      <div className="row">
        {canEditPricing ? (
          <>
            <button type="button" className="btn" onClick={addSection}>
              Add section
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => addLine(sections[0]?.id ?? null)}
            >
              Add line
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => openPicker(sections[0]?.id ?? null)}
            >
              Pick part
            </button>
            <button type="button" className="btn" onClick={refreshMsrp}>
              Refresh MSRP
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void sendToProcurement()}
            >
              Send to Procurement
            </button>
            <input
              className="field"
              style={{ maxWidth: 280 }}
              placeholder="Optional product URL (allowlisted)"
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
            />
            <label className="btn">
              Upload PDF quote
              <input
                type="file"
                accept="application/pdf"
                hidden
                onChange={(e) => uploadQuote(e.target.files?.[0] ?? null)}
              />
            </label>
          </>
        ) : null}
        <button type="button" className="btn" onClick={toggleSelectAll}>
          {allSelected ? "Clear selection" : "Select all"}
        </button>
        {message ? <span className="muted">{message}</span> : null}
      </div>

      {selected.size && bulkFields.length ? (
        <div
          className="row"
          style={{
            gap: "0.5rem",
            flexWrap: "wrap",
            alignItems: "center",
            padding: "0.5rem 0.65rem",
            background: "var(--bg-soft, #f4f7fa)",
            borderRadius: "var(--radius)",
          }}
        >
          <span className="muted" style={{ fontSize: "0.85rem" }}>
            {selected.size} selected
          </span>
          <select
            className="field"
            style={{ maxWidth: 180 }}
            value={bulkField}
            onChange={(e) => {
              const next = e.target.value as BomBulkField | "";
              setBulkField(next);
              setBulkValue(next === "order_status" ? "none" : "");
            }}
            aria-label="Bulk edit field"
          >
            <option value="">Bulk edit field…</option>
            {bulkFields.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          {bulkField === "vendor_id" ? (
            <select
              className="field"
              style={{ maxWidth: 200 }}
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
              aria-label="Bulk vendor"
            >
              <option value="">—</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.code} — {v.name}
                </option>
              ))}
            </select>
          ) : null}
          {bulkField === "order_status" ? (
            <select
              className="field"
              style={{ maxWidth: 160 }}
              value={bulkValue || "none"}
              onChange={(e) => setBulkValue(e.target.value)}
              aria-label="Bulk order status"
            >
              <option value="none">—</option>
              <option value="ordered">Ordered</option>
              <option value="shipped">Shipped</option>
            </select>
          ) : null}
          {bulkField === "section_id" ? (
            <select
              className="field"
              style={{ maxWidth: 200 }}
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
              aria-label="Bulk section"
            >
              <option value="">Unsectioned</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : null}
          {bulkField === "required_by_date" ? (
            <input
              className="field"
              type="date"
              style={{ maxWidth: 180 }}
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
              aria-label="Bulk required-by date"
            />
          ) : null}
          {bulkField === "qty" || bulkField === "override_pct" ? (
            <input
              className="field"
              type="number"
              step={bulkField === "override_pct" ? "0.01" : "1"}
              min="0"
              style={{ maxWidth: 120 }}
              value={bulkValue}
              placeholder={
                bulkField === "override_pct"
                  ? (defaultOverridePct * 100).toFixed(2)
                  : "0"
              }
              onChange={(e) => setBulkValue(e.target.value)}
              aria-label={`Bulk ${bulkField}`}
            />
          ) : null}
          {bulkField === "description" ||
          bulkField === "sku" ||
          bulkField === "category" ||
          bulkField === "tracking" ||
          bulkField === "notes" ? (
            <input
              className="field"
              style={{ maxWidth: 260 }}
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
              placeholder={`Set ${bulkField.replace(/_/g, " ")}…`}
              aria-label={`Bulk ${bulkField}`}
            />
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            disabled={!bulkField}
            onClick={bulkUpdateSelected}
          >
            Apply
          </button>
        </div>
      ) : selected.size ? (
        <div className="muted" style={{ fontSize: "0.85rem" }}>
          {selected.size} selected
        </div>
      ) : null}

      <div className="table-wrap panel-light">
        <table className="bom-table">
          <colgroup>
            <col className="col-drag" />
            <col className="col-check" />
            <col className="col-item" />
            <col className="col-sku" />
            <col className="col-cat" />
            <col className="col-qty" />
            <col className="col-money" />
            <col className="col-money" />
            <col className="col-money" />
            <col className="col-pct" />
            <col className="col-money" />
            <col className="col-money" />
            <col className="col-money" />
            <col className="col-vendor" />
            <col className="col-date" />
            <col className="col-proc" />
            <col className="col-qty-sm" />
            <col className="col-qty-sm" />
            <col className="col-qty-sm" />
            <col className="col-status" />
            <col className="col-track" />
            <col className="col-notes" />
            <col className="col-fetch" />
          </colgroup>
          <thead>
            <tr>
              <th aria-label="Reorder" />
              <th>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleSelectAll}
                  title="Select all"
                  aria-label="Select all"
                />
              </th>
              <th title="Item">Item</th>
              <th title="SKU">SKU</th>
              <th title="Category">Category</th>
              <th title="Quantity">Qty</th>
              <th title="Estimated unit cost">Est.&nbsp;cost</th>
              <th title="MSRP">MSRP</th>
              <th title="Quote">Quote</th>
              <th title="Override %">%</th>
              <th title="Unit sale">Sale</th>
              <th title="Total sale">Total&nbsp;sale</th>
              <th title="Quoted Material Profit">QMP</th>
              <th title="Vendor">Vendor</th>
              <th title="Required by date">Required&nbsp;by</th>
              <th title="Procurement status">Procurement</th>
              <th title="Quantity ordered">Ordered</th>
              <th title="Quantity received">Received</th>
              <th title="Remaining to order">Remain</th>
              <th title="Order status">Status</th>
              <th title="Tracking number">Tracking</th>
              <th title="Notes">Notes</th>
              <th title="MSRP fetch status">Fetch</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(({ section, lines: groupLines }) => {
              const sectionIds = groupLines.map((l) => l.id);
              const sectionAll =
                sectionIds.length > 0 &&
                sectionIds.every((id) => selected.has(id));
              const sectionSome =
                !sectionAll && sectionIds.some((id) => selected.has(id));
              return (
                <Fragment key={section?.id ?? "general"}>
                  <tr
                    className="section-row"
                    onDragOver={onSectionDragOver}
                    onDrop={(e) => onSectionDrop(e, section?.id ?? null)}
                  >
                    <td colSpan={23}>
                      <div className="section-bar">
                        <label className="section-select">
                          <input
                            type="checkbox"
                            checked={sectionAll}
                            ref={(el) => {
                              if (el) el.indeterminate = sectionSome;
                            }}
                            disabled={!groupLines.length}
                            onChange={() => toggleSelectSection(groupLines)}
                            title="Select section"
                            aria-label={`Select all in ${section?.name ?? "General"}`}
                          />
                          <span className="section-title">
                            {section?.name ?? "General"}
                          </span>
                          {groupLines.length ? (
                            <span className="muted" style={{ fontWeight: 500 }}>
                              ({groupLines.length})
                            </span>
                          ) : null}
                        </label>
                        {canEditPricing ? (
                          <div className="row">
                            <button
                              type="button"
                              className="btn"
                              onClick={() => toggleSelectSection(groupLines)}
                              disabled={!groupLines.length}
                            >
                              {sectionAll ? "Clear section" : "Select section"}
                            </button>
                            <button
                              type="button"
                              className="btn"
                              onClick={() => addLine(section?.id ?? null)}
                            >
                              Add line
                            </button>
                            <button
                              type="button"
                              className="btn"
                              onClick={() => openPicker(section?.id ?? null)}
                            >
                              Pick part
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {groupLines.map((line) => {
                    const pricing = calculateLinePricing({
                      qty: line.qty,
                      msrp: line.msrp,
                      quote: line.quote,
                      overridePct: line.override_pct,
                      projectDefaultOverridePct: defaultOverridePct,
                    });
                    const isDragging = dragKey === line._key;
                    const isDropBefore =
                      dropTarget?.key === line._key &&
                      dropTarget.place === "before";
                    const isDropAfter =
                      dropTarget?.key === line._key &&
                      dropTarget.place === "after";
                    return (
                      <tr
                        key={line._key}
                        className={[
                          "bom-row",
                          isDragging ? "dragging" : "",
                          isDropBefore ? "drag-over-before" : "",
                          isDropAfter ? "drag-over-after" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onDragOver={(e) => onLineDragOver(e, line._key)}
                        onDrop={(e) => onLineDrop(e, line._key)}
                        onDragEnd={onDragEnd}
                      >
                        <td className="bom-drag-cell">
                          {canEditPricing ? (
                            <button
                              type="button"
                              className="bom-drag-handle"
                              draggable
                              title="Drag to reorder"
                              aria-label="Drag to reorder"
                              onDragStart={(e) =>
                                onLineDragStart(e, line._key)
                              }
                            >
                              ⋮⋮
                            </button>
                          ) : null}
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.has(line.id)}
                            onChange={(e) => {
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(line.id);
                                else next.delete(line.id);
                                return next;
                              });
                            }}
                          />
                        </td>
                        <td>
                          <input
                            value={line.description}
                            disabled={!canEditPricing}
                            onChange={(e) =>
                              updateLine(line._key, {
                                description: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={line.sku ?? ""}
                            disabled={!canEditPricing}
                            onChange={(e) =>
                              updateLine(line._key, {
                                sku: e.target.value || null,
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={line.category ?? ""}
                            disabled={!canEditPricing}
                            onChange={(e) =>
                              updateLine(line._key, {
                                category: e.target.value || null,
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={line.qty}
                            disabled={!canEditPricing}
                            onChange={(e) =>
                              updateLine(line._key, {
                                qty: Number(e.target.value),
                              })
                            }
                          />
                        </td>
                        <td>
                          <CurrencyInput
                            value={line.estimated_unit_cost ?? null}
                            allowEmpty
                            disabled={!canEditPricing}
                            onChange={(v) =>
                              updateLine(line._key, {
                                estimated_unit_cost: v,
                              })
                            }
                          />
                        </td>
                        <td>
                          <CurrencyInput
                            value={line.msrp}
                            disabled={!canEditPricing}
                            onChange={(msrp) =>
                              updateLine(line._key, { msrp: msrp ?? 0 })
                            }
                          />
                        </td>
                        <td>
                          <CurrencyInput
                            value={line.quote}
                            allowEmpty
                            isDefault={line.quote == null}
                            defaultDisplay={line.msrp}
                            disabled={!canEditPricing}
                            onChange={(quote) =>
                              updateLine(line._key, { quote })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            value={
                              line.override_pct == null
                                ? ""
                                : Number(line.override_pct) * 100
                            }
                            placeholder={(defaultOverridePct * 100).toFixed(2)}
                            disabled={!canEditPricing}
                            onChange={(e) =>
                              updateLine(line._key, {
                                override_pct:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value) / 100,
                              })
                            }
                          />
                        </td>
                        <td
                          style={{
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {formatMoney(pricing.unitSale)}
                        </td>
                        <td
                          style={{
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {formatMoney(pricing.totalSale)}
                        </td>
                        <td
                          style={{
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                            ...outOfPocketStyle(
                              pricing.outOfPocket,
                              pricing.totalQuote,
                            ),
                          }}
                        >
                          {formatSignedMoney(pricing.outOfPocket)}
                        </td>
                        <td>
                          <select
                            value={line.vendor_id ?? ""}
                            disabled={!canEditPricing}
                            onChange={(e) =>
                              updateLine(line._key, {
                                vendor_id: e.target.value || null,
                              })
                            }
                          >
                            <option value="">—</option>
                            {vendors.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.code}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            type="date"
                            value={line.required_by_date ?? ""}
                            disabled={!canEditPricing}
                            onChange={(e) =>
                              updateLine(line._key, {
                                required_by_date: e.target.value || null,
                              })
                            }
                          />
                        </td>
                        <td className="muted" style={{ fontSize: "0.78rem" }}>
                          {(line.procurement_status || "not_ordered").replace(
                            /_/g,
                            " ",
                          )}
                        </td>
                        <td>{Number(line.qty_ordered || 0)}</td>
                        <td>{Number(line.qty_received || 0)}</td>
                        <td>
                          {Math.max(
                            0,
                            Number(line.qty || 0) -
                              Number(line.qty_ordered || 0),
                          )}
                        </td>
                        <td>
                          <select
                            value={line.order_status}
                            onChange={(e) =>
                              updateLine(line._key, {
                                order_status: e.target.value as OrderStatus,
                              })
                            }
                          >
                            <option value="none">—</option>
                            <option value="ordered">Ordered</option>
                            <option value="shipped">Shipped</option>
                          </select>
                        </td>
                        <td>
                          <input
                            value={line.tracking ?? ""}
                            onChange={(e) =>
                              updateLine(line._key, {
                                tracking: e.target.value || null,
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={line.notes ?? ""}
                            onChange={(e) =>
                              updateLine(line._key, {
                                notes: e.target.value || null,
                              })
                            }
                          />
                        </td>
                        <td
                          title={
                            line.fetch_error ??
                            (line.msrp_fetched_at ? "fetched" : "")
                          }
                          style={{
                            color: line.fetch_error ? "#b91c1c" : undefined,
                          }}
                        >
                          {line.fetch_error
                            ? "Error"
                            : line.msrp_fetched_at
                              ? "fetched"
                              : ""}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {[...selected].length === 1 &&
      ![...selected][0]?.startsWith("new-") ? (
        <div className="panel" style={{ padding: "0.85rem 1rem" }}>
          <AttachmentsPanel
            projectId={projectId}
            entityType="line_item"
            entityId={[...selected][0]}
            canUpload={canEditPricing}
          />
        </div>
      ) : null}

      <PartPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onAdd={addFromCatalog}
      />
    </div>
  );
}
