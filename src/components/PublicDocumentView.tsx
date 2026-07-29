"use client";

import { useState } from "react";
import {
  ClientDocumentRenderer,
  brandingFromSettings,
} from "@/components/ClientDocumentRenderer";
import { documentIsOpenForCustomer } from "@/lib/client-documents";
import {
  CLIENT_DOCUMENT_STATUS_LABELS,
  type ClientDocument,
  type ClientDocumentBlock,
  type ClientDocumentSignature,
  type CompanySettings,
} from "@/lib/types";

export function PublicDocumentView({
  token,
  initialDocument,
  initialBlocks,
  initialSignatures,
  settings,
  clientName,
}: {
  token: string;
  initialDocument: ClientDocument;
  initialBlocks: ClientDocumentBlock[];
  initialSignatures: ClientDocumentSignature[];
  settings: CompanySettings;
  clientName: string | null;
}) {
  const [doc, setDoc] = useState(initialDocument);
  const [blocks, setBlocks] = useState(initialBlocks);
  const [signatures, setSignatures] = useState(initialSignatures);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const open = documentIsOpenForCustomer(doc.status);

  async function api(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/d/${token}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(data.error || "Something went wrong. Please try again."));
        return null;
      }
      return data as Record<string, unknown>;
    } finally {
      setBusy(false);
    }
  }

  async function persistSelection(
    blockId: string,
    lineId: string,
    patch: { selected?: boolean; qty?: number },
  ) {
    const data = await api("selection", {
      block_id: blockId,
      line_id: lineId,
      ...patch,
    });
    if (!data) return;
    if (Array.isArray(data.blocks)) {
      setBlocks(data.blocks as ClientDocumentBlock[]);
    }
    if (data.document) setDoc(data.document as ClientDocument);
  }

  async function sign(values: {
    signer_name: string;
    signer_email: string;
    signature_text: string;
  }) {
    if (!values.signer_name || !values.signature_text) {
      setError("Please enter your name and signature.");
      return;
    }
    const data = await api("accept", values);
    if (!data) return;
    if (data.document) setDoc(data.document as ClientDocument);
    if (data.signature) {
      setSignatures((prev) => [...prev, data.signature as ClientDocumentSignature]);
    }
    setNotice("Thank you — your acceptance has been recorded.");
  }

  async function decline(comment: string) {
    const data = await api("decline", { comment });
    if (!data) return;
    if (data.document) setDoc(data.document as ClientDocument);
    setNotice("Your response has been recorded. The sender has been notified.");
  }

  const statusLabel = CLIENT_DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status;

  return (
    <div className="cdoc-public-shell">
      <div className="cdoc-public-bar">
        <span className="cdoc-public-status">
          {doc.name} · {statusLabel}
          {doc.status === "expired"
            ? " — this document has expired. Contact the sender for an updated version."
            : ""}
        </span>
        <a
          className="cdoc-btn"
          href={`/api/d/${token}/pdf`}
          download
          style={{ textDecoration: "none" }}
        >
          Download PDF
        </a>
      </div>
      {error ? (
        <div className="cdoc-public-bar" style={{ color: "#ba0517" }}>
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="cdoc-public-bar" style={{ color: "#2e844a" }}>
          {notice}
        </div>
      ) : null}
      <div className="cdoc-public-frame">
        <ClientDocumentRenderer
          doc={doc}
          blocks={blocks}
          branding={brandingFromSettings(settings)}
          clientName={clientName}
          signatures={signatures}
          interactive={open}
          busy={busy}
          onToggleLine={(blockId, lineId, selected) =>
            void persistSelection(blockId, lineId, { selected })
          }
          onChangeQty={(blockId, lineId, qty) =>
            void persistSelection(blockId, lineId, { qty })
          }
          onSign={(values) => void sign(values)}
          onDecline={(comment) => void decline(comment)}
        />
      </div>
    </div>
  );
}
