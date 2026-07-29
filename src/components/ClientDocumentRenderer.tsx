"use client";

import { FormEvent, useState } from "react";
import { formatMoney } from "@/lib/pricing";
import {
  computePricingTotals,
  normalizePricingContent,
} from "@/lib/client-documents";
import type {
  ClientDocumentBlock,
  ClientDocumentSignature,
  CompanySettings,
} from "@/lib/types";

export interface RendererBranding {
  legal_name: string | null;
  logo_path: string | null;
  brand_color_primary: string;
  brand_color_accent: string;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
}

export function brandingFromSettings(s: CompanySettings): RendererBranding {
  return {
    legal_name: s.legal_name,
    logo_path: s.logo_path,
    brand_color_primary: s.brand_color_primary,
    brand_color_accent: s.brand_color_accent,
    contact_email: s.contact_email,
    contact_phone: s.contact_phone,
    address: s.address,
  };
}

function str(value: unknown): string {
  return String(value ?? "");
}

function listItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v ?? "")).filter((v) => v.trim());
}

/**
 * Customer-facing document renderer — shared by the staff "preview as
 * customer" mode and the public /d/[token] page. Renders only block content
 * (which never contains cost data).
 */
export function ClientDocumentRenderer({
  doc,
  blocks,
  branding,
  clientName,
  signatures,
  interactive = false,
  busy = false,
  onToggleLine,
  onChangeQty,
  onSign,
  onDecline,
}: {
  doc: {
    name: string;
    doc_number: string;
    version: number;
    status: string;
    expires_at: string | null;
  };
  blocks: ClientDocumentBlock[];
  branding: RendererBranding;
  clientName: string | null;
  signatures: ClientDocumentSignature[];
  /** Allow option toggles + signing (public page / staff preview). */
  interactive?: boolean;
  busy?: boolean;
  onToggleLine?: (blockId: string, lineId: string, selected: boolean) => void;
  onChangeQty?: (blockId: string, lineId: string, qty: number) => void;
  onSign?: (values: {
    signer_name: string;
    signer_email: string;
    signature_text: string;
  }) => void;
  onDecline?: (comment: string) => void;
}) {
  const accent = branding.brand_color_primary || "#0070f2";
  const ink = branding.brand_color_accent || "#223548";
  const visible = blocks.filter((b) => !b.hidden);
  const signed = signatures.length > 0;

  const [signName, setSignName] = useState("");
  const [signEmail, setSignEmail] = useState("");
  const [signText, setSignText] = useState("");
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineComment, setDeclineComment] = useState("");

  function submitSign(e: FormEvent) {
    e.preventDefault();
    if (!onSign) return;
    onSign({
      signer_name: signName.trim(),
      signer_email: signEmail.trim(),
      signature_text: (signText.trim() || signName.trim()),
    });
  }

  return (
    <div className="cdoc" style={{ ["--cdoc-accent" as string]: accent, ["--cdoc-ink" as string]: ink }}>
      {visible.map((block) => {
        const content = block.content ?? {};
        switch (block.block_type) {
          case "cover":
            return (
              <section key={block.id} className="cdoc-cover">
                {branding.logo_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={branding.logo_path}
                    alt={branding.legal_name ?? "Logo"}
                    className="cdoc-logo"
                  />
                ) : null}
                <h1>{str(content.heading) || doc.name}</h1>
                {str(content.subheading) ? <p>{str(content.subheading)}</p> : null}
                <div className="cdoc-cover-meta">
                  {doc.doc_number} · v{doc.version}
                  {doc.expires_at
                    ? ` · Valid through ${new Date(doc.expires_at).toLocaleDateString("en-US")}`
                    : ""}
                </div>
              </section>
            );
          case "intro":
          case "text":
          case "project_summary":
          case "terms":
          case "payment_instructions":
          case "contact": {
            const fallback: Record<string, string> = {
              project_summary: "Project Summary",
              terms: "Terms & Conditions",
              payment_instructions: "Payment Instructions",
              contact: "Contact",
            };
            const title = str(content.title) || fallback[block.block_type] || "";
            const body = str(content.body);
            if (!title && !body) return null;
            return (
              <section key={block.id} className="cdoc-section">
                {title ? <h2>{title}</h2> : null}
                {body ? <p className="cdoc-body">{body}</p> : null}
              </section>
            );
          }
          case "customer_info": {
            const note = str(content.note);
            return (
              <section key={block.id} className="cdoc-section">
                <h2>Prepared for</h2>
                <p className="cdoc-body">
                  {[clientName, note].filter(Boolean).join("\n") || "—"}
                </p>
              </section>
            );
          }
          case "image": {
            const url = str(content.url);
            if (!url) return null;
            return (
              <section key={block.id} className="cdoc-section">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={str(content.caption)} className="cdoc-image" />
                {str(content.caption) ? (
                  <p className="cdoc-caption">{str(content.caption)}</p>
                ) : null}
              </section>
            );
          }
          case "scope":
          case "deliverables": {
            const title =
              str(content.title) ||
              (block.block_type === "scope" ? "Scope of Work" : "Deliverables");
            const rows = listItems(content.items);
            if (!rows.length) return null;
            return (
              <section key={block.id} className="cdoc-section">
                <h2>{title}</h2>
                <ul className="cdoc-list">
                  {rows.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </section>
            );
          }
          case "pricing": {
            const pricing = normalizePricingContent(content);
            const totals = computePricingTotals(content);
            const canInteract = interactive && !signed && !busy;
            return (
              <section key={block.id} className="cdoc-section">
                <h2>{pricing.title || "Pricing"}</h2>
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
                      {pricing.lines.map((line) => {
                        const active = line.selected || !line.optional;
                        return (
                          <tr key={line.id} className={active ? "" : "cdoc-line-off"}>
                            <td className="cdoc-col-include">
                              {line.optional ? (
                                <input
                                  type="checkbox"
                                  checked={line.selected}
                                  disabled={!canInteract || !onToggleLine}
                                  onChange={(e) =>
                                    onToggleLine?.(block.id, line.id, e.target.checked)
                                  }
                                  aria-label={`Include ${line.name}`}
                                />
                              ) : null}
                            </td>
                            <td>
                              <div className="cdoc-line-name">
                                {line.name}
                                {line.optional ? (
                                  <span className="cdoc-tag">Optional</span>
                                ) : null}
                              </div>
                              {line.description ? (
                                <div className="cdoc-line-desc">{line.description}</div>
                              ) : null}
                            </td>
                            <td className="cdoc-num">
                              {line.qty_editable && canInteract && onChangeQty ? (
                                <input
                                  type="number"
                                  min={0}
                                  max={9999}
                                  value={line.qty}
                                  className="cdoc-qty"
                                  onChange={(e) =>
                                    onChangeQty(
                                      block.id,
                                      line.id,
                                      Number(e.target.value),
                                    )
                                  }
                                />
                              ) : (
                                line.qty
                              )}
                            </td>
                            <td className="cdoc-num">{formatMoney(line.unit_price)}</td>
                            <td className="cdoc-num">
                              {active ? formatMoney(line.qty * line.unit_price) : "—"}
                            </td>
                          </tr>
                        );
                      })}
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
              </section>
            );
          }
          case "acceptance": {
            return (
              <section key={block.id} className="cdoc-section cdoc-accept">
                <h2>{str(content.title) || "Acceptance"}</h2>
                {str(content.statement) ? (
                  <p className="cdoc-body">{str(content.statement)}</p>
                ) : null}
                {signed ? (
                  <div className="cdoc-signed">
                    {signatures.map((sig) => (
                      <div key={sig.id}>
                        <div className="cdoc-signature-text">{sig.signature_text}</div>
                        <div className="cdoc-signature-meta">
                          Signed electronically by {sig.signer_name}
                          {sig.signer_email ? ` <${sig.signer_email}>` : ""} on{" "}
                          {new Date(sig.signed_at).toLocaleString("en-US")}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : interactive && onSign ? (
                  <form className="cdoc-sign-form" onSubmit={submitSign}>
                    <div className="cdoc-sign-grid">
                      <label>
                        Full name
                        <input
                          value={signName}
                          onChange={(e) => setSignName(e.target.value)}
                          required
                          disabled={busy}
                        />
                      </label>
                      <label>
                        Email
                        <input
                          type="email"
                          value={signEmail}
                          onChange={(e) => setSignEmail(e.target.value)}
                          disabled={busy}
                        />
                      </label>
                    </div>
                    <label>
                      Type your signature
                      <input
                        className="cdoc-signature-input"
                        value={signText}
                        onChange={(e) => setSignText(e.target.value)}
                        placeholder={signName || "Your name"}
                        disabled={busy}
                      />
                    </label>
                    <div className="cdoc-sign-actions">
                      <button type="submit" className="cdoc-btn-primary" disabled={busy}>
                        Accept &amp; sign
                      </button>
                      {onDecline ? (
                        declineOpen ? (
                          <span className="cdoc-decline-row">
                            <input
                              value={declineComment}
                              onChange={(e) => setDeclineComment(e.target.value)}
                              placeholder="Tell us what to change (optional)"
                              disabled={busy}
                            />
                            <button
                              type="button"
                              className="cdoc-btn"
                              disabled={busy}
                              onClick={() => onDecline(declineComment)}
                            >
                              Confirm decline
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="cdoc-btn"
                            disabled={busy}
                            onClick={() => setDeclineOpen(true)}
                          >
                            Decline
                          </button>
                        )
                      ) : null}
                    </div>
                    <p className="cdoc-sign-note">
                      By clicking Accept &amp; sign you agree this electronic
                      signature is legally binding. Your name, signature, time,
                      and IP address are recorded.
                    </p>
                  </form>
                ) : onSign ? (
                  <p className="cdoc-sign-note">
                    This document is no longer open for signature. Contact us if
                    you need an updated copy.
                  </p>
                ) : (
                  <p className="cdoc-sign-note">
                    Signature is collected on the customer link.
                  </p>
                )}
              </section>
            );
          }
          default:
            return null;
        }
      })}

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
    </div>
  );
}
