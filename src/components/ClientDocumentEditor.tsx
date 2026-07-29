"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CurrencyInput } from "@/components/CurrencyInput";
import {
  ClientDocumentRenderer,
  brandingFromSettings,
} from "@/components/ClientDocumentRenderer";
import {
  autosaveLabel,
  useDebouncedAutosave,
} from "@/lib/hooks/useDebouncedAutosave";
import { formatMoney } from "@/lib/pricing";
import {
  CLIENT_DOC_BLOCK_LABELS,
  CLIENT_DOC_BLOCK_TYPES,
  computeDocumentTotals,
  defaultBlockContent,
  normalizePricingContent,
  type ClientDocBlockType,
  type PricingBlockContent,
  type PricingLine,
} from "@/lib/client-documents";
import {
  CLIENT_DOCUMENT_STATUS_LABELS,
  CLIENT_DOCUMENT_TYPE_LABELS,
  type ClientDocument,
  type ClientDocumentBlock,
  type ClientDocumentEvent,
  type ClientDocumentSignature,
  type CompanySettings,
  type UserProfile,
} from "@/lib/types";

const EDITABLE_STATUSES = [
  "draft",
  "internal_review",
  "approved_to_send",
  "sent",
  "viewed",
  "customer_reviewing",
  "changes_requested",
];

const DEVICE_WIDTHS = { desktop: 820, tablet: 640, mobile: 390 } as const;

type Device = keyof typeof DEVICE_WIDTHS;

interface ImportLine {
  id: string;
  name: string;
  category: string | null;
  qty: number;
  unit_price: number;
  total: number;
}

interface ImportData {
  sections: Array<{ id: string; name: string; lines: ImportLine[] }>;
  labor: ImportLine[];
}

function newBlockId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `blk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function contentStr(block: ClientDocumentBlock, key: string): string {
  return String(block.content?.[key] ?? "");
}

function contentItems(block: ClientDocumentBlock): string[] {
  const items = block.content?.items;
  return Array.isArray(items) ? items.map((i) => String(i ?? "")) : [];
}

export function ClientDocumentEditor({
  projectId,
  initialDocument,
  initialBlocks,
  settings,
  clientName,
  users,
  events,
  signatures,
  canEdit,
  startInPreview = false,
}: {
  projectId: string;
  initialDocument: ClientDocument;
  initialBlocks: ClientDocumentBlock[];
  settings: CompanySettings;
  clientName: string | null;
  users: UserProfile[];
  events: ClientDocumentEvent[];
  signatures: ClientDocumentSignature[];
  canEdit: boolean;
  startInPreview?: boolean;
}) {
  const router = useRouter();
  const [doc, setDoc] = useState(initialDocument);
  const [blocks, setBlocks] = useState<ClientDocumentBlock[]>(initialBlocks);
  const [revision, setRevision] = useState(0);
  const [mode, setMode] = useState<"edit" | "preview">(
    startInPreview ? "preview" : "edit",
  );
  const [device, setDevice] = useState<Device>("desktop");
  const [error, setError] = useState<string | null>(null);
  const [importFor, setImportFor] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const [undoStack, setUndoStack] = useState<ClientDocumentBlock[][]>([]);
  const [redoStack, setRedoStack] = useState<ClientDocumentBlock[][]>([]);
  const blocksRef = useRef(blocks);
  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  const editable =
    canEdit && !doc.archived_at && EDITABLE_STATUSES.includes(doc.status);

  const totals = useMemo(() => computeDocumentTotals(blocks), [blocks]);

  function mutate(fn: (prev: ClientDocumentBlock[]) => ClientDocumentBlock[]) {
    if (!editable) return;
    const prev = blocksRef.current;
    const next = fn(prev);
    setUndoStack((stack) => [...stack.slice(-59), prev]);
    setRedoStack([]);
    setBlocks(next);
    setRevision((r) => r + 1);
  }

  function undo() {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1]!;
    setUndoStack(undoStack.slice(0, -1));
    setRedoStack([...redoStack, blocksRef.current]);
    setBlocks(prev);
    setRevision((r) => r + 1);
  }

  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1]!;
    setRedoStack(redoStack.slice(0, -1));
    setUndoStack([...undoStack, blocksRef.current]);
    setBlocks(next);
    setRevision((r) => r + 1);
  }

  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  useEffect(() => {
    undoRef.current = undo;
    redoRef.current = redo;
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      e.preventDefault();
      if (e.shiftKey) redoRef.current();
      else undoRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const saveStatus = useDebouncedAutosave({
    revision,
    enabled: editable,
    save: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/documents/${doc.id}/contents`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blocks: blocksRef.current }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(data.error || "Save failed"));
        throw new Error("save failed");
      }
      setError(null);
      const updated = data.document as ClientDocument | undefined;
      if (updated) {
        setDoc((d) => ({
          ...d,
          subtotal: updated.subtotal,
          discount_total: updated.discount_total,
          tax_total: updated.tax_total,
          total: updated.total,
        }));
      }
    },
  });

  async function patchMeta(patch: Record<string, unknown>) {
    const res = await fetch(`/api/projects/${projectId}/documents/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(String(data.error || "Update failed"));
      return;
    }
    setError(null);
    setDoc(data.document as ClientDocument);
    router.refresh();
  }

  // --- block operations -----------------------------------------------------

  function addBlock(type: ClientDocBlockType) {
    const block: ClientDocumentBlock = {
      id: newBlockId(),
      document_id: doc.id,
      block_type: type,
      sort_order: blocks.length,
      hidden: false,
      content: defaultBlockContent(type),
    };
    if (type === "terms" && settings.default_terms) {
      block.content = { ...block.content, body: settings.default_terms };
    }
    if (type === "payment_instructions" && settings.default_payment_instructions) {
      block.content = {
        ...block.content,
        body: settings.default_payment_instructions,
      };
    }
    mutate((prev) => [...prev, block]);
  }

  function updateContent(blockId: string, patch: Record<string, unknown>) {
    mutate((prev) =>
      prev.map((b) =>
        b.id === blockId ? { ...b, content: { ...(b.content ?? {}), ...patch } } : b,
      ),
    );
  }

  function updatePricing(
    blockId: string,
    fn: (pricing: PricingBlockContent) => PricingBlockContent,
  ) {
    mutate((prev) =>
      prev.map((b) =>
        b.id === blockId
          ? {
              ...b,
              content: fn(normalizePricingContent(b.content)) as unknown as Record<
                string,
                unknown
              >,
            }
          : b,
      ),
    );
  }

  function movePricingLineBetween(
    fromBlockId: string,
    toBlockId: string,
    lineId: string,
  ) {
    if (fromBlockId === toBlockId) return;
    mutate((prev) => {
      const source = prev.find((b) => b.id === fromBlockId);
      if (!source) return prev;
      const sourcePricing = normalizePricingContent(source.content);
      const line = sourcePricing.lines.find((l) => l.id === lineId);
      if (!line) return prev;
      return prev.map((b) => {
        if (b.id === fromBlockId) {
          return {
            ...b,
            content: {
              ...sourcePricing,
              lines: sourcePricing.lines.filter((l) => l.id !== lineId),
            } as unknown as Record<string, unknown>,
          };
        }
        if (b.id === toBlockId) {
          const targetPricing = normalizePricingContent(b.content);
          return {
            ...b,
            content: {
              ...targetPricing,
              lines: [...targetPricing.lines, line],
            } as unknown as Record<string, unknown>,
          };
        }
        return b;
      });
    });
  }

  function moveBlock(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    mutate((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item!);
      return next;
    });
  }

  function reorderBlock(from: number, to: number) {
    if (from === to) return;
    mutate((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return next;
    });
  }

  function duplicateBlock(index: number) {
    mutate((prev) => {
      const source = prev[index]!;
      const copy: ClientDocumentBlock = {
        ...source,
        id: newBlockId(),
        content: JSON.parse(JSON.stringify(source.content ?? {})),
      };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }

  function removeBlock(index: number) {
    mutate((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleHidden(index: number) {
    mutate((prev) =>
      prev.map((b, i) => (i === index ? { ...b, hidden: !b.hidden } : b)),
    );
  }

  // --- preview interactions (set customer defaults, autosaved) --------------

  function previewToggleLine(blockId: string, lineId: string, selected: boolean) {
    updatePricing(blockId, (pricing) => ({
      ...pricing,
      lines: pricing.lines.map((l) =>
        l.id === lineId && l.optional ? { ...l, selected } : l,
      ),
    }));
  }

  function previewChangeQty(blockId: string, lineId: string, qty: number) {
    updatePricing(blockId, (pricing) => ({
      ...pricing,
      lines: pricing.lines.map((l) =>
        l.id === lineId && l.qty_editable
          ? { ...l, qty: Math.max(0, Math.min(9999, Math.round(qty))) }
          : l,
      ),
    }));
  }

  const label = autosaveLabel(saveStatus);
  const lastCustomerEvent = events.find((e) => !e.actor_user_id);
  const pricingSections = blocks
    .filter((b) => b.block_type === "pricing")
    .map((b, i) => ({
      id: b.id,
      title:
        (normalizePricingContent(b.content).title ?? "").trim() ||
        `Pricing section ${i + 1}`,
    }));

  return (
    <div className="stack">
      <div className="cdoc-editor-toolbar">
        <Link className="btn" href={`/projects/${projectId}/documents`}>
          ← Documents
        </Link>
        <input
          className="field-light"
          style={{ flex: 1, minWidth: 200, fontWeight: 650 }}
          defaultValue={doc.name}
          disabled={!editable}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== doc.name) void patchMeta({ name });
          }}
        />
        <span className="badge badge-neutral">
          {CLIENT_DOCUMENT_TYPE_LABELS[doc.doc_type]} · {doc.doc_number} · v
          {doc.version}
        </span>
        <span className="badge badge-blue">
          {CLIENT_DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status}
        </span>
        {mode === "edit" && editable ? (
          <>
            <button
              className="btn"
              onClick={undo}
              disabled={!undoStack.length}
              title="Undo (Ctrl/Cmd+Z)"
            >
              ↺ Undo
            </button>
            <button
              className="btn"
              onClick={redo}
              disabled={!redoStack.length}
              title="Redo (Ctrl/Cmd+Shift+Z)"
            >
              ↻ Redo
            </button>
          </>
        ) : null}
        <button
          className="btn"
          onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
        >
          {mode === "edit" ? "Preview as customer" : "Back to editing"}
        </button>
        <a
          className="btn"
          href={`/api/projects/${projectId}/documents/${doc.id}/pdf`}
          download
        >
          PDF
        </a>
        {label ? <span className="muted">{label}</span> : null}
        {error ? <span style={{ color: "var(--danger)" }}>{error}</span> : null}
      </div>

      <div
        className="row"
        style={{ gap: "0.75rem", alignItems: "end", flexWrap: "wrap" }}
      >
        <div>
          <label className="label">Expires</label>
          <input
            className="field-light"
            type="date"
            defaultValue={doc.expires_at ? doc.expires_at.slice(0, 10) : ""}
            disabled={!canEdit}
            onChange={(e) =>
              void patchMeta({ expires_at: e.target.value || null })
            }
          />
        </div>
        <div>
          <label className="label">Assigned to</label>
          <select
            className="field-light"
            value={doc.assigned_to ?? ""}
            disabled={!canEdit}
            onChange={(e) =>
              void patchMeta({ assigned_to: e.target.value || null })
            }
          >
            <option value="">—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Workflow</label>
          <select
            className="field-light"
            value={
              ["draft", "internal_review", "approved_to_send"].includes(doc.status)
                ? doc.status
                : ""
            }
            disabled={
              !canEdit ||
              !["draft", "internal_review", "approved_to_send"].includes(doc.status)
            }
            onChange={(e) => {
              if (e.target.value) void patchMeta({ status: e.target.value });
            }}
          >
            {["draft", "internal_review", "approved_to_send"].includes(doc.status) ? (
              <>
                <option value="draft">Draft</option>
                <option value="internal_review">Internal Review</option>
                <option value="approved_to_send">Approved to Send</option>
              </>
            ) : (
              <option value="">
                {CLIENT_DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status}
              </option>
            )}
          </select>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div className="label">Document total</div>
          <strong style={{ fontSize: "1.1rem" }}>{formatMoney(totals.total)}</strong>
          {lastCustomerEvent ? (
            <div className="muted" style={{ fontSize: "0.78rem" }}>
              Customer: {lastCustomerEvent.event_type.replace(/_/g, " ")} ·{" "}
              {new Date(lastCustomerEvent.created_at).toLocaleString("en-US")}
            </div>
          ) : null}
        </div>
      </div>

      {!editable && canEdit ? (
        <p className="muted" style={{ margin: 0 }}>
          This document is {doc.archived_at ? "archived" : doc.status} and can no
          longer be edited. Create a new version from the documents list to make
          changes.
        </p>
      ) : null}

      {mode === "preview" ? (
        <div className="stack">
          <div className="row" style={{ gap: "0.4rem" }}>
            {(Object.keys(DEVICE_WIDTHS) as Device[]).map((d) => (
              <button
                key={d}
                className={`btn ${device === d ? "btn-primary" : ""}`}
                onClick={() => setDevice(d)}
              >
                {d[0]!.toUpperCase() + d.slice(1)}
              </button>
            ))}
            <span className="muted" style={{ alignSelf: "center" }}>
              Option toggles here set the customer&apos;s defaults.
            </span>
          </div>
          <div
            className="cdoc-preview-frame"
            style={{ maxWidth: DEVICE_WIDTHS[device], width: "100%" }}
          >
            <ClientDocumentRenderer
              doc={doc}
              blocks={blocks}
              branding={brandingFromSettings(settings)}
              clientName={clientName}
              signatures={signatures}
              interactive={editable}
              onToggleLine={previewToggleLine}
              onChangeQty={previewChangeQty}
            />
          </div>
        </div>
      ) : (
        <div className="cdoc-editor-layout">
          <div className="cdoc-palette panel-light" style={{ padding: "0.6rem" }}>
            <div className="label" style={{ marginBottom: "0.2rem" }}>
              Add a block
            </div>
            {CLIENT_DOC_BLOCK_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => addBlock(type)}
                disabled={!editable}
              >
                + {CLIENT_DOC_BLOCK_LABELS[type]}
              </button>
            ))}
          </div>

          <div>
            {blocks.length === 0 ? (
              <div className="panel" style={{ padding: "1.25rem" }}>
                <p className="muted" style={{ margin: 0 }}>
                  This document is empty — add blocks from the palette.
                </p>
              </div>
            ) : null}
            {blocks.map((block, index) => (
              <BlockCard
                key={block.id}
                block={block}
                index={index}
                count={blocks.length}
                editable={editable}
                dragging={dragIndex === index}
                onDragStart={() => setDragIndex(index)}
                onDragEnd={() => setDragIndex(null)}
                onDropOn={() => {
                  if (dragIndex != null) reorderBlock(dragIndex, index);
                  setDragIndex(null);
                }}
                onMove={(delta) => moveBlock(index, delta)}
                onDuplicate={() => duplicateBlock(index)}
                onRemove={() => removeBlock(index)}
                onToggleHidden={() => toggleHidden(index)}
                onContent={(patch) => updateContent(block.id, patch)}
                onPricing={(fn) => updatePricing(block.id, fn)}
                onOpenImport={() => setImportFor(block.id)}
                pricingSections={pricingSections}
                onMoveLineTo={(toBlockId, lineId) =>
                  movePricingLineBetween(block.id, toBlockId, lineId)
                }
              />
            ))}
          </div>
        </div>
      )}

      {importFor ? (
        <ImportBomModal
          projectId={projectId}
          onClose={() => setImportFor(null)}
          onAdd={(lines) => {
            updatePricing(importFor, (pricing) => ({
              ...pricing,
              lines: [...pricing.lines, ...lines],
            }));
            setImportFor(null);
          }}
        />
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Block card + per-type editors
 * ------------------------------------------------------------------------ */

function BlockCard({
  block,
  index,
  count,
  editable,
  dragging,
  onDragStart,
  onDragEnd,
  onDropOn,
  onMove,
  onDuplicate,
  onRemove,
  onToggleHidden,
  onContent,
  onPricing,
  onOpenImport,
  pricingSections,
  onMoveLineTo,
}: {
  block: ClientDocumentBlock;
  index: number;
  count: number;
  editable: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOn: () => void;
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onToggleHidden: () => void;
  onContent: (patch: Record<string, unknown>) => void;
  onPricing: (fn: (pricing: PricingBlockContent) => PricingBlockContent) => void;
  onOpenImport: () => void;
  pricingSections: Array<{ id: string; title: string }>;
  onMoveLineTo: (toBlockId: string, lineId: string) => void;
}) {
  const type = block.block_type as ClientDocBlockType;
  const label = CLIENT_DOC_BLOCK_LABELS[type] ?? block.block_type;

  return (
    <div
      className="cdoc-block-card"
      data-hidden={block.hidden ? "true" : "false"}
      data-dragging={dragging ? "true" : "false"}
      onDragOver={(e) => {
        if (editable) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropOn();
      }}
    >
      <div
        className="cdoc-block-head"
        draggable={editable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <span className="cdoc-block-title">
          {label}
          {block.hidden ? " (hidden)" : ""}
        </span>
        {editable ? (
          <div className="cdoc-block-tools">
            <button onClick={() => onMove(-1)} disabled={index === 0} title="Move up">
              ↑
            </button>
            <button
              onClick={() => onMove(1)}
              disabled={index === count - 1}
              title="Move down"
            >
              ↓
            </button>
            <button onClick={onToggleHidden} title={block.hidden ? "Show" : "Hide"}>
              {block.hidden ? "Show" : "Hide"}
            </button>
            <button onClick={onDuplicate} title="Duplicate block">
              ⧉
            </button>
            <button onClick={onRemove} title="Delete block" style={{ color: "var(--danger)" }}>
              ✕
            </button>
          </div>
        ) : null}
      </div>
      <div className="cdoc-block-body">
        <BlockForm
          block={block}
          editable={editable}
          onContent={onContent}
          onPricing={onPricing}
          onOpenImport={onOpenImport}
          pricingSections={pricingSections}
          onMoveLineTo={onMoveLineTo}
        />
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="field-light"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function AreaField({
  label,
  value,
  onChange,
  disabled,
  rows = 4,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <textarea
        className="field-light"
        rows={rows}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function BlockForm({
  block,
  editable,
  onContent,
  onPricing,
  onOpenImport,
  pricingSections,
  onMoveLineTo,
}: {
  block: ClientDocumentBlock;
  editable: boolean;
  onContent: (patch: Record<string, unknown>) => void;
  onPricing: (fn: (pricing: PricingBlockContent) => PricingBlockContent) => void;
  onOpenImport: () => void;
  pricingSections: Array<{ id: string; title: string }>;
  onMoveLineTo: (toBlockId: string, lineId: string) => void;
}) {
  const disabled = !editable;
  switch (block.block_type as ClientDocBlockType) {
    case "cover":
      return (
        <>
          <TextField
            label="Heading"
            value={contentStr(block, "heading")}
            onChange={(v) => onContent({ heading: v })}
            disabled={disabled}
          />
          <TextField
            label="Subheading"
            value={contentStr(block, "subheading")}
            onChange={(v) => onContent({ subheading: v })}
            disabled={disabled}
          />
        </>
      );
    case "customer_info":
      return (
        <AreaField
          label="Note shown with the customer's details"
          value={contentStr(block, "note")}
          onChange={(v) => onContent({ note: v })}
          disabled={disabled}
          rows={2}
        />
      );
    case "image":
      return (
        <>
          <TextField
            label="Image URL"
            value={contentStr(block, "url")}
            onChange={(v) => onContent({ url: v })}
            disabled={disabled}
            placeholder="https://… or /brand/…"
          />
          <TextField
            label="Caption"
            value={contentStr(block, "caption")}
            onChange={(v) => onContent({ caption: v })}
            disabled={disabled}
          />
        </>
      );
    case "scope":
    case "deliverables":
      return (
        <>
          <TextField
            label="Title"
            value={contentStr(block, "title")}
            onChange={(v) => onContent({ title: v })}
            disabled={disabled}
          />
          <AreaField
            label="Items (one per line)"
            value={contentItems(block).join("\n")}
            onChange={(v) => onContent({ items: v.split("\n") })}
            disabled={disabled}
            rows={5}
          />
        </>
      );
    case "pricing":
      return (
        <PricingBlockEditor
          block={block}
          editable={editable}
          onPricing={onPricing}
          onOpenImport={onOpenImport}
          pricingSections={pricingSections}
          onMoveLineTo={onMoveLineTo}
        />
      );
    case "acceptance":
      return (
        <>
          <TextField
            label="Title"
            value={contentStr(block, "title")}
            onChange={(v) => onContent({ title: v })}
            disabled={disabled}
          />
          <AreaField
            label="Acceptance statement"
            value={contentStr(block, "statement")}
            onChange={(v) => onContent({ statement: v })}
            disabled={disabled}
            rows={2}
          />
        </>
      );
    default:
      return (
        <>
          <TextField
            label="Title"
            value={contentStr(block, "title")}
            onChange={(v) => onContent({ title: v })}
            disabled={disabled}
          />
          <AreaField
            label="Body"
            value={contentStr(block, "body")}
            onChange={(v) => onContent({ body: v })}
            disabled={disabled}
            rows={5}
          />
        </>
      );
  }
}

/* --------------------------------------------------------------------------
 * Pricing block editor
 * ------------------------------------------------------------------------ */

function PricingBlockEditor({
  block,
  editable,
  onPricing,
  onOpenImport,
  pricingSections,
  onMoveLineTo,
}: {
  block: ClientDocumentBlock;
  editable: boolean;
  onPricing: (fn: (pricing: PricingBlockContent) => PricingBlockContent) => void;
  onOpenImport: () => void;
  pricingSections: Array<{ id: string; title: string }>;
  onMoveLineTo: (toBlockId: string, lineId: string) => void;
}) {
  const pricing = normalizePricingContent(block.content);
  const disabled = !editable;
  const otherSections = pricingSections.filter((s) => s.id !== block.id);

  function updateLine(lineId: string, patch: Partial<PricingLine>) {
    onPricing((p) => ({
      ...p,
      lines: p.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)),
    }));
  }

  function removeLine(lineId: string) {
    onPricing((p) => ({ ...p, lines: p.lines.filter((l) => l.id !== lineId) }));
  }

  function moveLine(lineId: string, delta: number) {
    onPricing((p) => {
      const from = p.lines.findIndex((l) => l.id === lineId);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= p.lines.length) return p;
      const lines = [...p.lines];
      const [item] = lines.splice(from, 1);
      lines.splice(to, 0, item!);
      return { ...p, lines };
    });
  }

  function addLine() {
    onPricing((p) => ({
      ...p,
      lines: [
        ...p.lines,
        {
          id: newBlockId(),
          name: "",
          description: null,
          category: null,
          qty: 1,
          unit_price: 0,
          optional: false,
          selected: true,
          qty_editable: false,
        },
      ],
    }));
  }

  return (
    <div className="stack" style={{ gap: "0.6rem" }}>
      <div className="row" style={{ gap: "0.6rem", alignItems: "end", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <TextField
            label="Section title"
            value={pricing.title ?? ""}
            onChange={(v) => onPricing((p) => ({ ...p, title: v }))}
            disabled={disabled}
          />
        </div>
        {editable ? (
          <>
            <button className="btn" type="button" onClick={onOpenImport}>
              Import from BOM / Labor
            </button>
            <button className="btn" type="button" onClick={addLine}>
              Add line
            </button>
          </>
        ) : null}
      </div>

      <div className="table-wrap">
        <table className="bom-table">
          <thead>
            <tr>
              <th style={{ minWidth: 220 }}>Item</th>
              <th>Category</th>
              <th style={{ width: 70 }}>Qty</th>
              <th style={{ width: 100 }}>Unit price</th>
              <th style={{ width: 100, textAlign: "right" }}>Total</th>
              <th title="Customer may include/exclude">Optional</th>
              <th title="Customer may change quantity">Qty editable</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pricing.lines.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted" style={{ padding: "0.75rem" }}>
                  No lines yet — import from the BOM or add lines manually. Only
                  customer-facing sale prices are used.
                </td>
              </tr>
            ) : (
              pricing.lines.map((line, lineIndex) => (
                <tr key={line.id}>
                  <td>
                    <input
                      className="field-light"
                      value={line.name}
                      disabled={disabled}
                      placeholder="Item name"
                      onChange={(e) => updateLine(line.id, { name: e.target.value })}
                    />
                    <input
                      className="field-light"
                      style={{ marginTop: 4, fontSize: "0.82rem" }}
                      value={line.description ?? ""}
                      disabled={disabled}
                      placeholder="Customer-facing description (optional)"
                      onChange={(e) =>
                        updateLine(line.id, { description: e.target.value || null })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="field-light"
                      value={line.category ?? ""}
                      disabled={disabled}
                      onChange={(e) =>
                        updateLine(line.id, { category: e.target.value || null })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="field-light"
                      type="number"
                      min={0}
                      value={line.qty}
                      disabled={disabled}
                      onChange={(e) =>
                        updateLine(line.id, { qty: Math.max(0, Number(e.target.value)) })
                      }
                    />
                  </td>
                  <td>
                    <CurrencyInput
                      value={line.unit_price}
                      disabled={disabled}
                      onChange={(v) => updateLine(line.id, { unit_price: v ?? 0 })}
                    />
                  </td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {formatMoney(line.qty * line.unit_price)}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={line.optional}
                      disabled={disabled}
                      onChange={(e) =>
                        updateLine(line.id, {
                          optional: e.target.checked,
                          selected: e.target.checked ? line.selected : true,
                        })
                      }
                    />
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={line.qty_editable}
                      disabled={disabled}
                      onChange={(e) =>
                        updateLine(line.id, { qty_editable: e.target.checked })
                      }
                    />
                  </td>
                  <td>
                    {editable ? (
                      <div
                        className="row"
                        style={{ gap: "0.25rem", flexWrap: "nowrap" }}
                      >
                        <button
                          className="btn"
                          type="button"
                          onClick={() => moveLine(line.id, -1)}
                          disabled={lineIndex === 0}
                          title="Move line up"
                        >
                          ↑
                        </button>
                        <button
                          className="btn"
                          type="button"
                          onClick={() => moveLine(line.id, 1)}
                          disabled={lineIndex === pricing.lines.length - 1}
                          title="Move line down"
                        >
                          ↓
                        </button>
                        {otherSections.length > 0 ? (
                          <select
                            className="field-light"
                            value=""
                            title="Move line to another pricing section"
                            style={{ width: 92 }}
                            onChange={(e) => {
                              if (e.target.value) {
                                onMoveLineTo(e.target.value, line.id);
                              }
                            }}
                          >
                            <option value="">Move to…</option>
                            {otherSections.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.title}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        <button
                          className="btn"
                          type="button"
                          onClick={() => removeLine(line.id)}
                          title="Remove line"
                        >
                          ✕
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ gap: "0.75rem", flexWrap: "wrap" }}>
        <div>
          <label className="label">Discount</label>
          <div className="row" style={{ gap: "0.35rem" }}>
            <select
              className="field-light"
              value={pricing.discount.type}
              disabled={disabled}
              onChange={(e) =>
                onPricing((p) => ({
                  ...p,
                  discount: {
                    ...p.discount,
                    type: e.target.value as PricingBlockContent["discount"]["type"],
                  },
                }))
              }
            >
              <option value="none">None</option>
              <option value="percent">Percent</option>
              <option value="amount">Amount</option>
            </select>
            {pricing.discount.type !== "none" ? (
              <input
                className="field-light"
                type="number"
                min={0}
                step="0.01"
                style={{ width: 110 }}
                value={pricing.discount.value}
                disabled={disabled}
                onChange={(e) =>
                  onPricing((p) => ({
                    ...p,
                    discount: { ...p.discount, value: Math.max(0, Number(e.target.value)) },
                  }))
                }
              />
            ) : null}
          </div>
        </div>
        <div>
          <label className="label">Tax</label>
          <div className="row" style={{ gap: "0.35rem" }}>
            <select
              className="field-light"
              value={pricing.tax.type}
              disabled={disabled}
              onChange={(e) =>
                onPricing((p) => ({
                  ...p,
                  tax: {
                    ...p.tax,
                    type: e.target.value as PricingBlockContent["tax"]["type"],
                  },
                }))
              }
            >
              <option value="none">None</option>
              <option value="percent">Percent</option>
              <option value="amount">Amount</option>
            </select>
            {pricing.tax.type !== "none" ? (
              <>
                <input
                  className="field-light"
                  type="number"
                  min={0}
                  step="0.01"
                  style={{ width: 110 }}
                  value={pricing.tax.value}
                  disabled={disabled}
                  onChange={(e) =>
                    onPricing((p) => ({
                      ...p,
                      tax: { ...p.tax, value: Math.max(0, Number(e.target.value)) },
                    }))
                  }
                />
                <input
                  className="field-light"
                  style={{ width: 130 }}
                  value={pricing.tax.label ?? "Tax"}
                  disabled={disabled}
                  placeholder="Label"
                  onChange={(e) =>
                    onPricing((p) => ({
                      ...p,
                      tax: { ...p.tax, label: e.target.value },
                    }))
                  }
                />
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
 * BOM / Labor import modal
 * ------------------------------------------------------------------------ */

function ImportBomModal({
  projectId,
  onClose,
  onAdd,
}: {
  projectId: string;
  onClose: () => void;
  onAdd: (lines: PricingLine[]) => void;
}) {
  const [data, setData] = useState<ImportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [asOptional, setAsOptional] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/projects/${projectId}/documents/import-bom`);
      const body = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setError(String(body.error || "Failed to load BOM"));
        return;
      }
      setData(body as ImportData);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  function toggle(key: string, on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function toggleGroup(keys: string[], on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (on) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }

  function collectSelected(): PricingLine[] {
    if (!data) return [];
    const lines: PricingLine[] = [];
    const push = (line: ImportLine, source: string) => {
      if (!checked.has(`${source}:${line.id}`)) return;
      lines.push({
        id: newBlockId(),
        name: line.name,
        description: null,
        category: line.category,
        qty: line.qty,
        unit_price: line.unit_price,
        optional: asOptional,
        selected: true,
        qty_editable: false,
      });
    };
    for (const section of data.sections) {
      for (const line of section.lines) push(line, "bom");
    }
    for (const line of data.labor) push(line, "labor");
    return lines;
  }

  const selectedCount = checked.size;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel"
        style={{ maxWidth: 720, width: "100%", maxHeight: "82vh", overflow: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <strong>Import from BOM &amp; Labor</strong>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="muted" style={{ margin: "0.4rem 0 0.8rem" }}>
          Items are copied with customer sale prices only — vendor costs, quotes,
          and margins are never included. Prices are frozen at import.
        </p>
        {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
        {!data && !error ? <p className="muted">Loading…</p> : null}

        {data ? (
          <div className="stack" style={{ gap: "0.8rem" }}>
            {[...data.sections, { id: "labor", name: "Labor", lines: data.labor }].map(
              (section) => {
                const source = section.id === "labor" ? "labor" : "bom";
                const keys = section.lines.map((l) => `${source}:${l.id}`);
                const allOn = keys.length > 0 && keys.every((k) => checked.has(k));
                if (!section.lines.length) return null;
                return (
                  <div key={section.id} className="table-wrap panel-light" style={{ padding: "0.6rem" }}>
                    <label className="row" style={{ gap: "0.5rem", fontWeight: 650 }}>
                      <input
                        type="checkbox"
                        checked={allOn}
                        onChange={(e) => toggleGroup(keys, e.target.checked)}
                      />
                      {section.name}
                      <span className="muted" style={{ fontWeight: 400 }}>
                        {section.lines.length} lines
                      </span>
                    </label>
                    <table className="bom-table" style={{ marginTop: "0.4rem" }}>
                      <tbody>
                        {section.lines.map((line) => {
                          const key = `${source}:${line.id}`;
                          return (
                            <tr key={key}>
                              <td style={{ width: 28 }}>
                                <input
                                  type="checkbox"
                                  checked={checked.has(key)}
                                  onChange={(e) => toggle(key, e.target.checked)}
                                />
                              </td>
                              <td>{line.name}</td>
                              <td className="muted">{line.category ?? ""}</td>
                              <td style={{ textAlign: "right" }}>{line.qty}</td>
                              <td style={{ textAlign: "right" }}>
                                {formatMoney(line.unit_price)}
                              </td>
                              <td style={{ textAlign: "right" }}>
                                {formatMoney(line.total)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              },
            )}

            <div className="row" style={{ gap: "0.75rem", alignItems: "center" }}>
              <label className="row" style={{ gap: "0.4rem", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={asOptional}
                  onChange={(e) => setAsOptional(e.target.checked)}
                />
                Add as optional items
              </label>
              <button
                className="btn btn-primary"
                disabled={!selectedCount}
                onClick={() => onAdd(collectSelected())}
              >
                Add {selectedCount || ""} selected
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
