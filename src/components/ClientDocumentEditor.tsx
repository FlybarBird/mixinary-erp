"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
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
  computePricingTotals,
  defaultBlockContent,
  flattenPricingGroups,
  groupPricingLines,
  movePricingLine,
  normalizePricingContent,
  pricingDropMarker,
  pricingLineParent,
  quoteLinkProposal,
  removePricingLine,
  applyQuoteLinkProposal,
  type PricingDropPlace,
  type ClientDocBlockType,
  type PricingBlockContent,
  type PricingLine,
  type PricingSourceLink,
  type PricingSourcePrice,
} from "@/lib/client-documents";
import {
  WysiwygBlock,
  WysiwygDocumentFooter,
  wysiwygDocStyle,
} from "@/components/ClientDocumentWysiwyg";
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
  const [linkFor, setLinkFor] = useState<{ blockId: string; lineId: string } | null>(null);
  const [sources, setSources] = useState<PricingSourcePrice[] | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [pricingEditId, setPricingEditId] = useState<string | null>(null);

  const [undoStack, setUndoStack] = useState<ClientDocumentBlock[][]>([]);
  const [redoStack, setRedoStack] = useState<ClientDocumentBlock[][]>([]);
  const blocksRef = useRef(blocks);
  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  const editable =
    canEdit && !doc.archived_at && EDITABLE_STATUSES.includes(doc.status);

  useEffect(() => {
    if (!editable) return;
    let cancelled = false;
    async function loadSources() {
      const res = await fetch(`/api/projects/${projectId}/documents/import-bom`);
      const body = await res.json().catch(() => ({}));
      if (cancelled || !res.ok) return;
      const prices: PricingSourcePrice[] = [];
      const sections = Array.isArray(body.sections) ? body.sections : [];
      const labor = Array.isArray(body.labor) ? body.labor : [];
      for (const section of sections) {
        for (const row of section.lines ?? []) {
          prices.push({
            source: "bom",
            id: String(row.id),
            name: String(row.name ?? ""),
            qty: Number(row.qty) || 0,
            unit_price: Number(row.unit_price) || 0,
            total: Number(row.total) || 0,
          });
        }
      }
      for (const row of labor) {
        prices.push({
          source: "labor",
          id: String(row.id),
          name: String(row.name ?? ""),
          qty: Number(row.qty) || 0,
          unit_price: Number(row.unit_price) || 0,
          total: Number(row.total) || 0,
        });
      }
      setSources(prices);
    }
    void loadSources();
    window.addEventListener("focus", loadSources);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", loadSources);
    };
  }, [editable, projectId]);

  const linkChanges = useMemo(() => {
    if (!sources) return [];
    const changes: Array<{ blockId: string; change: ReturnType<typeof quoteLinkProposal> }> = [];
    for (const block of blocks) {
      if (block.block_type !== "pricing" || block.hidden) continue;
      for (const line of normalizePricingContent(block.content).lines) {
        const change = quoteLinkProposal(line, sources);
        if (change) changes.push({ blockId: block.id, change });
      }
    }
    return changes;
  }, [blocks, sources]);

  function applyLinkedPrices(blockId: string, lineId?: string) {
    if (!sources) return;
    updatePricing(blockId, (pricing) => ({
      ...pricing,
      lines: pricing.lines.map((line) =>
        !lineId || line.id === lineId ? applyQuoteLinkProposal(line, sources) : line,
      ),
    }));
  }

  function applyAllLinkedPrices() {
    if (!sources) return;
    const blockIds = new Set(linkChanges.map((entry) => entry.blockId));
    mutate((prev) =>
      prev.map((block) => {
        if (!blockIds.has(block.id)) return block;
        const pricing = normalizePricingContent(block.content);
        return {
          ...block,
          content: {
            ...pricing,
            lines: pricing.lines.map((line) => applyQuoteLinkProposal(line, sources)),
          } as unknown as Record<string, unknown>,
        };
      }),
    );
  }

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
      if (target.isContentEditable) return;
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
      const moving = pricingLineParent(line, sourcePricing.lines)
        ? [{ ...line, parent_id: null }]
        : sourcePricing.lines.filter(
            (candidate) => candidate.id === lineId || candidate.parent_id === lineId,
          );
      const movingIds = new Set(moving.map((candidate) => candidate.id));
      return prev.map((b) => {
        if (b.id === fromBlockId) {
          return {
            ...b,
            content: {
              ...sourcePricing,
              lines: sourcePricing.lines.filter((l) => !movingIds.has(l.id)),
            } as unknown as Record<string, unknown>,
          };
        }
        if (b.id === toBlockId) {
          const targetPricing = normalizePricingContent(b.content);
          return {
            ...b,
            content: {
              ...targetPricing,
              lines: [...targetPricing.lines, ...moving],
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
        l.id === lineId && l.optional && !pricingLineParent(l, pricing.lines)
          ? { ...l, selected }
          : l,
      ),
    }));
  }

  function previewToggleSection(blockId: string, selected: boolean) {
    updatePricing(blockId, (pricing) =>
      pricing.optional ? { ...pricing, selected } : pricing,
    );
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
  const branding = useMemo(() => brandingFromSettings(settings), [settings]);
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
      {editable && linkChanges.length > 0 ? (
        <div className="cdoc-link-notice">
          <span>
            {linkChanges.length === 1
              ? `${linkChanges[0]!.change!.lineName} is out of date with the BOM or labor.`
              : `${linkChanges.length} quote items are out of date with the BOM or labor.`}{" "}
            Review the change, then update the quote.
          </span>
          <button className="btn btn-primary" type="button" onClick={applyAllLinkedPrices}>
            Update linked prices
          </button>
        </div>
      ) : null}

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
        <div className="cdoc-public-shell cdoc-editor-preview-shell">
          <div className="cdoc-public-bar" style={{ flexWrap: "wrap" }}>
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
            </div>
            <span className="cdoc-public-status">
              Option toggles here set the customer&apos;s defaults.
            </span>
          </div>
          <div
            className="cdoc-preview-frame"
            style={{ maxWidth: DEVICE_WIDTHS[device], width: "100%", margin: "0 auto" }}
          >
            <ClientDocumentRenderer
              doc={doc}
              blocks={blocks}
              branding={branding}
              clientName={clientName}
              signatures={signatures}
              interactive={editable}
              onToggleLine={previewToggleLine}
              onToggleSection={previewToggleSection}
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

          <div className="cdoc-public-shell cdoc-wysiwyg-shell">
            <div className="cdoc-public-frame">
              {blocks.length === 0 ? (
                <div className="panel" style={{ padding: "1.25rem" }}>
                  <p className="muted" style={{ margin: 0 }}>
                    This document is empty — add blocks from the palette.
                  </p>
                </div>
              ) : (
                <div
                  className="cdoc cdoc-wysiwyg"
                  style={wysiwygDocStyle(branding)}
                >
                  {blocks.map((block, index) => (
                    <WysiwygBlock
                      key={block.id}
                      block={block}
                      index={index}
                      count={blocks.length}
                      editable={editable}
                      selected={selectedBlockId === block.id}
                      dragging={dragIndex === index}
                      branding={branding}
                      clientName={clientName}
                      docName={doc.name}
                      docNumber={doc.doc_number}
                      docVersion={doc.version}
                      expiresAt={doc.expires_at}
                      projectId={projectId}
                      documentId={doc.id}
                      pricingSections={pricingSections}
                      pricingPanelOpen={pricingEditId === block.id}
                      onSelect={() => setSelectedBlockId(block.id)}
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
                      onOpenPricing={() => setPricingEditId(block.id)}
                      onClosePricing={() => setPricingEditId(null)}
                      documentTotals={totals}
                      onDeletePricingLine={(lineId) =>
                        updatePricing(block.id, (pricing) => ({
                          ...pricing,
                          lines: removePricingLine(pricing.lines, lineId),
                        }))
                      }
                      pricingEditor={
                        <PricingBlockEditor
                          block={block}
                          editable={editable}
                          sources={sources}
                          onPricing={(fn) => updatePricing(block.id, fn)}
                          onOpenImport={() => setImportFor(block.id)}
                          onLinkLine={(lineId) =>
                            setLinkFor({ blockId: block.id, lineId })
                          }
                          onApplyLink={(lineId) => applyLinkedPrices(block.id, lineId)}
                          pricingSections={pricingSections}
                          onMoveLineTo={(toBlockId, lineId) =>
                            movePricingLineBetween(block.id, toBlockId, lineId)
                          }
                        />
                      }
                    />
                  ))}
                  <WysiwygDocumentFooter branding={branding} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {importFor ? (
        <ImportBomModal
          projectId={projectId}
          mode="import"
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
      {linkFor ? (
        <ImportBomModal
          projectId={projectId}
          mode="link"
          initialLinks={
            normalizePricingContent(
              blocks.find((block) => block.id === linkFor.blockId)?.content,
            ).lines.find((line) => line.id === linkFor.lineId)?.links ?? []
          }
          onClose={() => setLinkFor(null)}
          onLink={(links) => {
            const target = linkFor;
            updatePricing(target.blockId, (pricing) => ({
              ...pricing,
              lines: pricing.lines.map((line) =>
                line.id === target.lineId ? { ...line, links } : line,
              ),
            }));
            setLinkFor(null);
          }}
        />
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Shared form fields (used by pricing panel)
 * ------------------------------------------------------------------------ */

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

/* --------------------------------------------------------------------------
 * Pricing block editor
 * ------------------------------------------------------------------------ */

function PricingBlockEditor({
  block,
  editable,
  sources,
  onPricing,
  onOpenImport,
  onLinkLine,
  onApplyLink,
  pricingSections,
  onMoveLineTo,
}: {
  block: ClientDocumentBlock;
  editable: boolean;
  sources: PricingSourcePrice[] | null;
  onPricing: (fn: (pricing: PricingBlockContent) => PricingBlockContent) => void;
  onOpenImport: () => void;
  onLinkLine: (lineId: string) => void;
  onApplyLink: (lineId: string) => void;
  pricingSections: Array<{ id: string; title: string }>;
  onMoveLineTo: (toBlockId: string, lineId: string) => void;
}) {
  const pricing = normalizePricingContent(block.content);
  const totals = computePricingTotals(block.content);
  const disabled = !editable;
  const otherSections = pricingSections.filter((s) => s.id !== block.id);
  const groups = groupPricingLines(pricing.lines);
  const [dragId, setDragId] = useState<string | null>(null);
  const [hover, setHover] = useState<{
    id: string;
    place: PricingDropPlace;
    nest: boolean;
  } | null>(null);
  const marker =
    dragId && hover
      ? pricingDropMarker(pricing.lines, dragId, hover.id, hover.place, hover.nest)
      : null;

  function lineIsBlock(lineId: string) {
    const group = groups.find((candidate) => candidate.line.id === lineId);
    return Boolean(group && group.children.length > 0);
  }

  function dropIntent(e: DragEvent, isChild: boolean) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const place: PricingDropPlace =
      e.clientY < rect.top + rect.height / 2 ? "before" : "after";
    const fromId = dragId;
    const nest = !fromId || lineIsBlock(fromId) ? false : isChild || (place === "after" && e.clientX > rect.left + 56);
    return { place, nest };
  }

  function onLineDragStart(e: DragEvent, lineId: string) {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", lineId);
    setDragId(lineId);
  }

  function onLineDragOver(e: DragEvent, lineId: string, isChild: boolean) {
    if (!editable || !dragId) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (dragId === lineId) return;
    const intent = dropIntent(e, isChild);
    setHover((prev) =>
      prev &&
      prev.id === lineId &&
      prev.place === intent.place &&
      prev.nest === intent.nest
        ? prev
        : { id: lineId, ...intent },
    );
  }

  function onLineDrop(e: DragEvent, lineId: string, isChild: boolean) {
    e.preventDefault();
    e.stopPropagation();
    const fromId = e.dataTransfer.getData("text/plain") || dragId;
    if (fromId && fromId !== lineId) {
      const intent = dropIntent(e, isChild);
      onPricing((current) => {
        const lines = movePricingLine(
          current.lines,
          fromId,
          lineId,
          intent.place,
          intent.nest && !lineIsBlock(fromId),
        );
        return lines === current.lines ? current : { ...current, lines };
      });
    }
    setDragId(null);
    setHover(null);
  }

  function onLineDragEnd() {
    setDragId(null);
    setHover(null);
  }

  function updateLine(lineId: string, patch: Partial<PricingLine>) {
    onPricing((p) => ({
      ...p,
      lines: p.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)),
    }));
  }

  function removeLine(lineId: string) {
    const line = pricing.lines.find((candidate) => candidate.id === lineId);
    const label = line?.name.trim() || "this line";
    const childCount = pricing.lines.filter((candidate) => candidate.parent_id === lineId).length;
    const extra =
      childCount > 0
        ? ` and its ${childCount} sub-item${childCount === 1 ? "" : "s"}`
        : "";
    if (!window.confirm(`Delete “${label}”${extra} from this pricing section?`)) return;
    onPricing((p) => ({ ...p, lines: removePricingLine(p.lines, lineId) }));
  }

  function moveLine(lineId: string, delta: number) {
    onPricing((p) => {
      const groups = groupPricingLines(p.lines);
      const childGroupIndex = groups.findIndex((group) =>
        group.children.some((child) => child.id === lineId),
      );
      if (childGroupIndex >= 0) {
        const group = groups[childGroupIndex]!;
        const from = group.children.findIndex((child) => child.id === lineId);
        const to = from + delta;
        if (from < 0 || to < 0 || to >= group.children.length) return p;
        const children = [...group.children];
        const [item] = children.splice(from, 1);
        children.splice(to, 0, item!);
        const next = groups.map((candidate, index) =>
          index === childGroupIndex ? { ...candidate, children } : candidate,
        );
        return { ...p, lines: flattenPricingGroups(next) };
      }
      const from = groups.findIndex((group) => group.line.id === lineId);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= groups.length) return p;
      const next = [...groups];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return { ...p, lines: flattenPricingGroups(next) };
    });
  }

  function blankLine(parentId: string | null): PricingLine {
    return {
      id: newBlockId(),
      name: "",
      description: null,
      category: null,
      qty: 1,
      unit_price: 0,
      optional: false,
      selected: true,
      qty_editable: false,
      parent_id: parentId,
      links: [],
    };
  }

  function addLine() {
    onPricing((p) => ({
      ...p,
      lines: [...p.lines, blankLine(null)],
    }));
  }

  function addSubItem(parentId: string) {
    onPricing((p) => {
      const groups = groupPricingLines(p.lines);
      const next = groups.map((group) =>
        group.line.id === parentId
          ? { ...group, children: [...group.children, blankLine(parentId)] }
          : group,
      );
      return { ...p, lines: flattenPricingGroups(next) };
    });
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
      <div className="row" style={{ gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <label className="cdoc-section-optional-toggle">
          <input
            type="checkbox"
            checked={pricing.optional}
            disabled={disabled}
            onChange={(e) =>
              onPricing((p) => ({
                ...p,
                optional: e.target.checked,
                selected: e.target.checked ? p.selected : true,
              }))
            }
          />
          Optional table
        </label>
        {pricing.optional ? (
          <label className="cdoc-section-optional-toggle">
            <input
              type="checkbox"
              checked={pricing.selected}
              disabled={disabled}
              onChange={(e) => onPricing((p) => ({ ...p, selected: e.target.checked }))}
            />
            Included by default
          </label>
        ) : null}
        {pricing.optional && !pricing.selected ? (
          <span className="muted">This table is left out of the quote total.</span>
        ) : null}
      </div>

      <div className="table-wrap">
        <table className="bom-table cdoc-pricing-editor">
          <thead>
            <tr>
              <th className="cdoc-drag-col" />
              <th style={{ minWidth: 220 }}>Item</th>
              <th>Category</th>
              <th style={{ width: 70 }}>Qty</th>
              <th style={{ width: 100 }}>Unit price</th>
              <th style={{ width: 100, textAlign: "right" }}>Total</th>
              <th style={{ minWidth: 112 }} title="Customer may include/exclude">
                Optional
              </th>
              <th title="Customer may change quantity">Qty editable</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={9} className="muted" style={{ padding: "0.75rem" }}>
                  No lines yet — import from the BOM or add lines manually. Only
                  customer-facing sale prices are used.
                </td>
              </tr>
            ) : (
              groups.flatMap((group, groupIndex) =>
                [group.line, ...group.children].map((line, rowIndex) => {
                  const isChild = rowIndex > 0;
                  const atStart = isChild ? rowIndex === 1 : groupIndex === 0;
                  const atEnd = isChild
                    ? rowIndex === group.children.length
                    : groupIndex === groups.length - 1;
                  const dragging =
                    dragId === line.id || (dragId != null && line.parent_id === dragId);
                  const marked = marker?.rowId === line.id;
                  return (
                    <tr
                      key={line.id}
                      className={[
                        isChild ? "cdoc-editor-subrow" : "",
                        dragging ? "cdoc-row-dragging" : "",
                        marked && marker?.place === "before" ? "cdoc-drop-before" : "",
                        marked && marker?.place === "after" ? "cdoc-drop-after" : "",
                        marked && marker?.nest ? "cdoc-drop-nest" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onDragOver={(e) => onLineDragOver(e, line.id, isChild)}
                      onDrop={(e) => onLineDrop(e, line.id, isChild)}
                      onDragEnd={onLineDragEnd}
                    >
                      <td className="bom-drag-cell">
                        {editable ? (
                          <span
                            className="bom-drag-handle"
                            draggable
                            title={
                              isChild
                                ? "Drag to reorder this sub-item"
                                : group.children.length > 0
                                  ? "Drag to reorder. Sub-items move with this item."
                                  : "Drag to reorder, or drop under an item to make it a sub-item"
                            }
                            aria-label={isChild ? "Drag sub-item" : "Drag item"}
                            onDragStart={(e) => onLineDragStart(e, line.id)}
                            onDragEnd={onLineDragEnd}
                          >
                            ⋮⋮
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <div className={isChild ? "cdoc-editor-subitem" : undefined}>
                          <input
                            className="field-light"
                            value={line.name}
                            disabled={disabled}
                            placeholder={isChild ? "Sub-item name" : "Item name"}
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
                          {isChild ? (
                            <div className="cdoc-follows-parent">Follows parent</div>
                          ) : null}
                          <PricingLinkNote
                            line={line}
                            sources={sources}
                            editable={editable}
                            onApply={() => onApplyLink(line.id)}
                          />
                          {editable ? (
                            <div className="row" style={{ gap: "0.35rem", marginTop: 6 }}>
                              {isChild ? null : (
                                <button
                                  className="btn"
                                  type="button"
                                  onClick={() => addSubItem(line.id)}
                                >
                                  Add sub-item
                                </button>
                              )}
                              <button
                                className="btn"
                                type="button"
                                onClick={() => onLinkLine(line.id)}
                              >
                                {line.links.length ? "Edit links" : "Link items"}
                              </button>
                              <button
                                className="btn btn-danger"
                                type="button"
                                onClick={() => removeLine(line.id)}
                              >
                                Delete
                              </button>
                            </div>
                          ) : null}
                        </div>
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
                        {isChild ? null : (
                          <input
                            type="checkbox"
                            checked={line.optional}
                            disabled={disabled}
                            title="Customer may include or exclude this item. Sub-items follow it."
                            onChange={(e) =>
                              updateLine(line.id, {
                                optional: e.target.checked,
                                selected: e.target.checked ? line.selected : true,
                              })
                            }
                          />
                        )}
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
                              disabled={atStart}
                              title={isChild ? "Move sub-item up" : "Move line up"}
                            >
                              ↑
                            </button>
                            <button
                              className="btn"
                              type="button"
                              onClick={() => moveLine(line.id, 1)}
                              disabled={atEnd}
                              title={isChild ? "Move sub-item down" : "Move line down"}
                            >
                              ↓
                            </button>
                            {!isChild && otherSections.length > 0 ? (
                              <select
                                className="field-light"
                                value=""
                                title="Move line and its sub-items to another pricing section"
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
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                }),
              )
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

      <div className="cdoc-totals cdoc-editor-totals">
        <div>
          <span>Subtotal</span>
          <span>{formatMoney(totals.subtotal)}</span>
        </div>
        {totals.discount_total > 0 ? (
          <div>
            <span>Discount</span>
            <span>−{formatMoney(totals.discount_total)}</span>
          </div>
        ) : null}
        {totals.tax_total > 0 ? (
          <div>
            <span>{pricing.tax.label || "Tax"}</span>
            <span>{formatMoney(totals.tax_total)}</span>
          </div>
        ) : null}
        <div className="cdoc-total-row">
          <span>Total</span>
          <span>{formatMoney(totals.total)}</span>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
 * BOM / Labor import modal
 * ------------------------------------------------------------------------ */

function PricingLinkNote({
  line,
  sources,
  editable,
  onApply,
}: {
  line: PricingLine;
  sources: PricingSourcePrice[] | null;
  editable: boolean;
  onApply: () => void;
}) {
  if (!line.links.length) return null;
  const names = line.links.map((link) => {
    const match = sources?.find(
      (source) => source.source === link.source && source.id === link.id,
    );
    return match?.name || (link.source === "labor" ? "Removed labor item" : "Removed BOM item");
  });
  const change = sources ? quoteLinkProposal(line, sources) : null;
  const label =
    names.length === 1 ? `Linked to ${names[0]}` : `Linked to ${names.length} items`;
  return (
    <div className={change ? "cdoc-link-meta cdoc-link-meta-stale" : "cdoc-link-meta"}>
      <span title={names.join(", ")}>{label}</span>
      {change?.priceChanged ? (
        <span>
          {" "}
          {formatMoney(change.currentTotal)} → {formatMoney(change.nextTotal)}
        </span>
      ) : null}
      {change && change.missingCount > 0 ? (
        <span>
          {" "}
          {change.missingCount} linked{" "}
          {change.missingCount === 1 ? "item is" : "items are"} no longer on the BOM or labor.
        </span>
      ) : null}
      {change && editable ? (
        <button className="btn" type="button" onClick={onApply}>
          Update
        </button>
      ) : null}
    </div>
  );
}

function ImportBomModal({
  projectId,
  mode,
  initialLinks = [],
  onClose,
  onAdd,
  onLink,
}: {
  projectId: string;
  mode: "import" | "link";
  initialLinks?: PricingSourceLink[];
  onClose: () => void;
  onAdd?: (lines: PricingLine[]) => void;
  onLink?: (links: PricingSourceLink[]) => void;
}) {
  const [data, setData] = useState<ImportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(initialLinks.map((link) => `${link.source}:${link.id}`)),
  );
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
        parent_id: null,
        links: [{ source: source === "labor" ? "labor" : "bom", id: line.id }],
      });
    };
    for (const section of data.sections) {
      for (const line of section.lines) push(line, "bom");
    }
    for (const line of data.labor) push(line, "labor");
    return lines;
  }

  function collectLinks(): PricingSourceLink[] {
    if (!data) return [];
    const links: PricingSourceLink[] = [];
    for (const section of data.sections) {
      for (const row of section.lines) {
        if (checked.has(`bom:${row.id}`)) links.push({ source: "bom", id: row.id });
      }
    }
    for (const row of data.labor) {
      if (checked.has(`labor:${row.id}`)) links.push({ source: "labor", id: row.id });
    }
    return links;
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
          <strong>{mode === "link" ? "Link BOM & Labor" : "Import from BOM & Labor"}</strong>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="muted" style={{ margin: "0.4rem 0 0.8rem" }}>
          {mode === "link"
            ? "Link one or more BOM or labor items to this quote line. Several items roll up into one price. The quote stays as it is until you click Update."
            : "Imported lines use customer sale prices and stay linked to the BOM or labor. A later change shows a notice so you can update the quote when you are ready."}
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
              {mode === "import" ? (
                <label className="row" style={{ gap: "0.4rem", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={asOptional}
                    onChange={(e) => setAsOptional(e.target.checked)}
                  />
                  Add as optional items
                </label>
              ) : null}
              <button
                className="btn btn-primary"
                disabled={mode === "import" && !selectedCount}
                onClick={() => {
                  if (mode === "link") onLink?.(collectLinks());
                  else onAdd?.(collectSelected());
                }}
              >
                {mode === "link"
                  ? selectedCount
                    ? `Link ${selectedCount} selected`
                    : "Remove links"
                  : `Add ${selectedCount || ""} selected`}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
