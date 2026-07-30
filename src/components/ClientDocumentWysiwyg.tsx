"use client";

import {
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  computePricingTotals,
  normalizePricingContent,
  CLIENT_DOC_BLOCK_LABELS,
  type ClientDocBlockType,
  type PricingBlockContent,
} from "@/lib/client-documents";
import { formatMoney } from "@/lib/pricing";
import type { RendererBranding } from "@/components/ClientDocumentRenderer";
import type { ClientDocumentBlock } from "@/lib/types";

function str(value: unknown): string {
  return String(value ?? "");
}

/** Single-line or multiline inline field that looks like document text. */
function EditableText({
  as = "div",
  className,
  value,
  placeholder,
  disabled,
  multiline = false,
  onCommit,
}: {
  as?: "h1" | "h2" | "p" | "div" | "span";
  className?: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  multiline?: boolean;
  onCommit: (next: string) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const Tag = as;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return;
    const next = value || "";
    if (el.textContent !== next) el.textContent = next;
  }, [value]);

  function commit() {
    const el = ref.current;
    if (!el) return;
    const next = (el.textContent ?? "").replace(/\u00a0/g, " ");
    if (next !== value) onCommit(next);
  }

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (!multiline && e.key === "Enter") {
      e.preventDefault();
      (e.target as HTMLElement).blur();
    }
  }

  return (
    <Tag
      ref={ref as never}
      className={className}
      contentEditable={!disabled}
      suppressContentEditableWarning
      data-placeholder={placeholder ?? ""}
      role="textbox"
      aria-multiline={multiline || undefined}
      aria-label={placeholder}
      onBlur={commit}
      onKeyDown={onKeyDown}
      onInput={() => {
        /* keep empty attribute in sync for CSS placeholder */
        const el = ref.current;
        if (!el) return;
        if ((el.textContent ?? "") === "") el.setAttribute("data-empty", "true");
        else el.removeAttribute("data-empty");
      }}
      {...((value || "") === "" ? { "data-empty": "true" } : {})}
    />
  );
}

export function WysiwygBlock({
  block,
  index,
  count,
  editable,
  selected,
  dragging,
  branding,
  clientName,
  docName,
  docNumber,
  docVersion,
  expiresAt,
  pricingSections,
  pricingPanelOpen,
  onSelect,
  onDragStart,
  onDragEnd,
  onDropOn,
  onMove,
  onDuplicate,
  onRemove,
  onToggleHidden,
  onContent,
  onOpenPricing,
  onClosePricing,
  pricingEditor,
}: {
  block: ClientDocumentBlock;
  index: number;
  count: number;
  editable: boolean;
  selected: boolean;
  dragging: boolean;
  branding: RendererBranding;
  clientName: string | null;
  docName: string;
  docNumber: string;
  docVersion: number;
  expiresAt: string | null;
  pricingSections: Array<{ id: string; title: string }>;
  pricingPanelOpen: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOn: () => void;
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onToggleHidden: () => void;
  onContent: (patch: Record<string, unknown>) => void;
  onOpenPricing: () => void;
  onClosePricing: () => void;
  pricingEditor: ReactNode;
}) {
  const type = block.block_type as ClientDocBlockType;
  const label = CLIENT_DOC_BLOCK_LABELS[type] ?? block.block_type;
  const content = block.content ?? {};
  void pricingSections;

  return (
    <div
      className="cdoc-wysiwyg-block"
      data-hidden={block.hidden ? "true" : "false"}
      data-dragging={dragging ? "true" : "false"}
      data-selected={selected ? "true" : "false"}
      data-type={type}
      onClick={onSelect}
      onDragOver={(e) => {
        if (editable) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropOn();
      }}
    >
      {editable ? (
        <div className="cdoc-wysiwyg-tools">
          <span
            className="cdoc-wysiwyg-handle"
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            title="Drag to reorder"
          >
            ⋮⋮
          </span>
          <span className="cdoc-wysiwyg-type">{label}</span>
          {block.hidden ? <span className="cdoc-wysiwyg-badge">Hidden</span> : null}
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} title="Move up">
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === count - 1}
            title="Move down"
          >
            ↓
          </button>
          <button type="button" onClick={onToggleHidden} title={block.hidden ? "Show" : "Hide"}>
            {block.hidden ? "Show" : "Hide"}
          </button>
          <button type="button" onClick={onDuplicate} title="Duplicate">
            ⧉
          </button>
          <button
            type="button"
            onClick={onRemove}
            title="Delete"
            style={{ color: "var(--danger)" }}
          >
            ✕
          </button>
        </div>
      ) : block.hidden ? (
        <div className="cdoc-wysiwyg-tools">
          <span className="cdoc-wysiwyg-badge">Hidden</span>
        </div>
      ) : null}

      <WysiwygBlockBody
        block={block}
        content={content}
        type={type}
        editable={editable}
        branding={branding}
        clientName={clientName}
        docName={docName}
        docNumber={docNumber}
        docVersion={docVersion}
        expiresAt={expiresAt}
        pricingPanelOpen={pricingPanelOpen}
        onContent={onContent}
        onOpenPricing={onOpenPricing}
        onClosePricing={onClosePricing}
        pricingEditor={pricingEditor}
      />
    </div>
  );
}

function WysiwygBlockBody({
  block,
  content,
  type,
  editable,
  branding,
  clientName,
  docName,
  docNumber,
  docVersion,
  expiresAt,
  pricingPanelOpen,
  onContent,
  onOpenPricing,
  onClosePricing,
  pricingEditor,
}: {
  block: ClientDocumentBlock;
  content: Record<string, unknown>;
  type: ClientDocBlockType;
  editable: boolean;
  branding: RendererBranding;
  clientName: string | null;
  docName: string;
  docNumber: string;
  docVersion: number;
  expiresAt: string | null;
  pricingPanelOpen: boolean;
  onContent: (patch: Record<string, unknown>) => void;
  onOpenPricing: () => void;
  onClosePricing: () => void;
  pricingEditor: ReactNode;
}) {
  switch (type) {
    case "cover":
      return (
        <section className="cdoc-cover">
          {branding.logo_path ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logo_path}
              alt={branding.legal_name ?? "Logo"}
              className="cdoc-logo"
            />
          ) : null}
          <EditableText
            as="h1"
            value={str(content.heading)}
            placeholder={docName || "Document heading"}
            disabled={!editable}
            onCommit={(v) => onContent({ heading: v })}
          />
          <EditableText
            as="p"
            value={str(content.subheading)}
            placeholder="Subheading (optional)"
            disabled={!editable}
            onCommit={(v) => onContent({ subheading: v })}
          />
          <div className="cdoc-cover-meta">
            {docNumber} · v{docVersion}
            {expiresAt
              ? ` · Valid through ${new Date(expiresAt).toLocaleDateString("en-US")}`
              : ""}
          </div>
        </section>
      );

    case "customer_info":
      return (
        <section className="cdoc-section">
          <h2>Prepared for</h2>
          <p className="cdoc-body" style={{ marginBottom: "0.35rem" }}>
            {clientName || "—"}
          </p>
          <EditableText
            as="p"
            className="cdoc-body"
            value={str(content.note)}
            placeholder="Optional note for the customer"
            disabled={!editable}
            multiline
            onCommit={(v) => onContent({ note: v })}
          />
        </section>
      );

    case "image": {
      const url = str(content.url);
      return (
        <section className="cdoc-section">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={str(content.caption)} className="cdoc-image" />
          ) : (
            <div className="cdoc-wysiwyg-image-empty">Add an image URL below</div>
          )}
          {editable ? (
            <div className="cdoc-wysiwyg-image-fields">
              <input
                className="cdoc-wysiwyg-field"
                value={url}
                placeholder="Image URL (https://… or /brand/…)"
                onChange={(e) => onContent({ url: e.target.value })}
              />
              <input
                className="cdoc-wysiwyg-field"
                value={str(content.caption)}
                placeholder="Caption"
                onChange={(e) => onContent({ caption: e.target.value })}
              />
            </div>
          ) : str(content.caption) ? (
            <p className="cdoc-caption">{str(content.caption)}</p>
          ) : null}
        </section>
      );
    }

    case "scope":
    case "deliverables": {
      const fallback =
        type === "scope" ? "Scope of Work" : "Deliverables";
      const items = Array.isArray(content.items)
        ? content.items.map((i) => String(i ?? ""))
        : [];
      return (
        <section className="cdoc-section">
          <EditableText
            as="h2"
            value={str(content.title)}
            placeholder={fallback}
            disabled={!editable}
            onCommit={(v) => onContent({ title: v })}
          />
          {editable ? (
            <textarea
              className="cdoc-wysiwyg-list-edit"
              rows={Math.max(3, items.length + 1)}
              value={items.join("\n")}
              placeholder="One item per line"
              onChange={(e) => onContent({ items: e.target.value.split("\n") })}
            />
          ) : (
            <ul className="cdoc-list">
              {items.filter((i) => i.trim()).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      );
    }

    case "pricing":
      return (
        <PricingWysiwyg
          block={block}
          editable={editable}
          panelOpen={pricingPanelOpen}
          onOpen={onOpenPricing}
          onClose={onClosePricing}
          pricingEditor={pricingEditor}
        />
      );

    case "acceptance":
      return (
        <section className="cdoc-section cdoc-accept">
          <EditableText
            as="h2"
            value={str(content.title)}
            placeholder="Acceptance"
            disabled={!editable}
            onCommit={(v) => onContent({ title: v })}
          />
          <EditableText
            as="p"
            className="cdoc-body"
            value={str(content.statement)}
            placeholder="Acceptance statement shown to the customer"
            disabled={!editable}
            multiline
            onCommit={(v) => onContent({ statement: v })}
          />
          <div className="cdoc-sign-form cdoc-wysiwyg-sign-mock" aria-hidden>
            <div className="cdoc-sign-grid">
              <label>
                Full name
                <input disabled placeholder="Customer name" />
              </label>
              <label>
                Email
                <input disabled type="email" placeholder="customer@email.com" />
              </label>
            </div>
            <label>
              Type your signature
              <input className="cdoc-signature-input" disabled placeholder="Signature" />
            </label>
            <div className="cdoc-sign-actions">
              <button type="button" className="cdoc-btn-primary" disabled>
                Accept &amp; sign
              </button>
              <button type="button" className="cdoc-btn" disabled>
                Decline
              </button>
            </div>
            <p className="cdoc-sign-note">
              Preview only — customers sign on the secure link.
            </p>
          </div>
        </section>
      );

    default: {
      const fallback: Record<string, string> = {
        project_summary: "Project Summary",
        terms: "Terms & Conditions",
        payment_instructions: "Payment Instructions",
        contact: "Contact",
        intro: "Introduction",
        text: "Section",
      };
      const titleFallback = fallback[type] || "Section";
      return (
        <section className="cdoc-section">
          <EditableText
            as="h2"
            value={str(content.title)}
            placeholder={titleFallback}
            disabled={!editable}
            onCommit={(v) => onContent({ title: v })}
          />
          <EditableText
            as="p"
            className="cdoc-body"
            value={str(content.body)}
            placeholder="Write this section…"
            disabled={!editable}
            multiline
            onCommit={(v) => onContent({ body: v })}
          />
        </section>
      );
    }
  }
}

function PricingWysiwyg({
  block,
  editable,
  panelOpen,
  onOpen,
  onClose,
  pricingEditor,
}: {
  block: ClientDocumentBlock;
  editable: boolean;
  panelOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  pricingEditor: ReactNode;
}) {
  const pricing = normalizePricingContent(block.content);
  const totals = computePricingTotals(block.content);

  return (
    <section className="cdoc-section">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>{pricing.title || "Pricing"}</h2>
        {editable ? (
          <button
            type="button"
            className="btn"
            onClick={(e) => {
              e.stopPropagation();
              if (panelOpen) onClose();
              else onOpen();
            }}
          >
            {panelOpen ? "Done editing" : "Edit pricing"}
          </button>
        ) : null}
      </div>

      {panelOpen && editable ? (
        <div className="cdoc-wysiwyg-pricing-panel" onClick={(e) => e.stopPropagation()}>
          {pricingEditor}
        </div>
      ) : (
        <div className="cdoc-pricing">
          <table>
            <thead>
              <tr>
                <th className="cdoc-col-include" />
                <th>Item</th>
                <th className="cdoc-num">Qty</th>
                <th className="cdoc-num">Unit</th>
                <th className="cdoc-num">Total</th>
              </tr>
            </thead>
            <tbody>
              {pricing.lines.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted" style={{ padding: "0.75rem" }}>
                    No lines yet
                    {editable ? " — click Edit pricing to import or add lines." : "."}
                  </td>
                </tr>
              ) : (
                pricing.lines.map((line) => {
                  const active = line.selected || !line.optional;
                  return (
                    <tr key={line.id} className={active ? "" : "cdoc-line-off"}>
                      <td className="cdoc-col-include">
                        {line.optional ? (
                          <input type="checkbox" checked={line.selected} disabled readOnly />
                        ) : null}
                      </td>
                      <td>
                        <div className="cdoc-line-name">
                          {line.name || "Untitled"}
                          {line.optional ? <span className="cdoc-tag">Optional</span> : null}
                        </div>
                        {line.description ? (
                          <div className="cdoc-line-desc">{line.description}</div>
                        ) : null}
                      </td>
                      <td className="cdoc-num">{line.qty}</td>
                      <td className="cdoc-num">{formatMoney(line.unit_price)}</td>
                      <td className="cdoc-num">
                        {active ? formatMoney(line.qty * line.unit_price) : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          <div className="cdoc-totals">
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
      )}
    </section>
  );
}

export function WysiwygDocumentFooter({ branding }: { branding: RendererBranding }) {
  return (
    <footer className="cdoc-footer">
      {[
        branding.legal_name,
        branding.address ? branding.address.replace(/\n/g, ", ") : null,
        branding.contact_email,
        branding.contact_phone,
      ]
        .filter(Boolean)
        .join("  ·  ")}
    </footer>
  );
}

export function wysiwygDocStyle(branding: RendererBranding): CSSProperties {
  return {
    ["--cdoc-accent" as string]: branding.brand_color_primary || "#0070f2",
    ["--cdoc-ink" as string]: branding.brand_color_accent || "#223548",
  };
}

export type { PricingBlockContent };
