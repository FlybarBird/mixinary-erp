"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { OverflowMenu } from "@/components/OverflowMenu";
import { formatMoney } from "@/lib/pricing";
import {
  CLIENT_DOCUMENT_STATUS_LABELS,
  CLIENT_DOCUMENT_TYPE_LABELS,
  type ClientDocument,
  type ClientDocumentEvent,
  type ClientDocumentToken,
  type ClientDocumentType,
  type UserProfile,
} from "@/lib/types";

const CREATABLE_TYPES: ClientDocumentType[] = [
  "proposal",
  "quote",
  "proposal_quote",
];

function statusBadgeClass(status: string) {
  if (["signed", "accepted"].includes(status)) return "badge badge-green";
  if (["sent", "viewed", "customer_reviewing"].includes(status)) {
    return "badge badge-blue";
  }
  if (["declined", "voided", "expired"].includes(status)) {
    return "badge badge-red";
  }
  return "badge badge-neutral";
}

function shortDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ClientDocumentsView({
  projectId,
  clientName,
  initialDocuments,
  initialEvents,
  initialTokens,
  users,
  canEdit,
}: {
  projectId: string;
  clientName: string | null;
  initialDocuments: ClientDocument[];
  initialEvents: ClientDocumentEvent[];
  initialTokens: ClientDocumentToken[];
  users: UserProfile[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newType, setNewType] = useState<ClientDocumentType>("proposal_quote");
  const [newName, setNewName] = useState("");
  const [sendDoc, setSendDoc] = useState<ClientDocument | null>(null);
  const [sendTo, setSendTo] = useState("");
  const [sendMessage, setSendMessage] = useState("");

  const userName = (id: string | null) => {
    if (!id) return "—";
    const user = users.find((u) => u.id === id);
    return user?.full_name || user?.email || "—";
  };

  const lastCustomerActivity = useMemo(() => {
    const map = new Map<string, string>();
    for (const event of initialEvents) {
      if (event.actor_user_id) continue;
      if (!map.has(event.document_id)) {
        map.set(
          event.document_id,
          `${event.event_type.replace(/_/g, " ")} · ${shortDate(event.created_at)}`,
        );
      }
    }
    return map;
  }, [initialEvents]);

  const activeToken = useMemo(() => {
    const map = new Map<string, ClientDocumentToken>();
    for (const token of initialTokens) {
      if (token.revoked_at) continue;
      if (!map.has(token.document_id)) map.set(token.document_id, token);
    }
    return map;
  }, [initialTokens]);

  async function api(
    path: string,
    init?: RequestInit,
  ): Promise<Record<string, unknown> | null> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(path, {
        headers: { "Content-Type": "application/json" },
        ...init,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(data.error || "Request failed"));
        return null;
      }
      return data as Record<string, unknown>;
    } finally {
      setBusy(false);
    }
  }

  async function createDocument(e: FormEvent) {
    e.preventDefault();
    const data = await api(`/api/projects/${projectId}/documents`, {
      method: "POST",
      body: JSON.stringify({ doc_type: newType, name: newName }),
    });
    if (!data) return;
    const doc = data.document as ClientDocument;
    setShowCreate(false);
    setNewName("");
    router.push(`/projects/${projectId}/documents/${doc.id}`);
  }

  async function duplicate(doc: ClientDocument, asNewVersion: boolean) {
    const data = await api(`/api/projects/${projectId}/documents`, {
      method: "POST",
      body: JSON.stringify(
        asNewVersion ? { new_version_of: doc.id } : { duplicate_of: doc.id },
      ),
    });
    if (!data) return;
    router.refresh();
    setNotice(asNewVersion ? "New version created" : "Document duplicated");
  }

  async function patchDocument(
    doc: ClientDocument,
    patch: Record<string, unknown>,
    message: string,
  ) {
    const data = await api(
      `/api/projects/${projectId}/documents/${doc.id}`,
      { method: "PATCH", body: JSON.stringify(patch) },
    );
    if (!data) return;
    const updated = data.document as ClientDocument;
    setDocuments((docs) => docs.map((d) => (d.id === doc.id ? updated : d)));
    setNotice(message);
    router.refresh();
  }

  async function deleteDraft(doc: ClientDocument) {
    if (!window.confirm(`Delete draft "${doc.name}"? This cannot be undone.`)) {
      return;
    }
    const data = await api(
      `/api/projects/${projectId}/documents/${doc.id}`,
      { method: "DELETE" },
    );
    if (!data) return;
    setDocuments((docs) => docs.filter((d) => d.id !== doc.id));
    setNotice("Draft deleted");
  }

  async function copyLink(doc: ClientDocument) {
    const data = await api(
      `/api/projects/${projectId}/documents/${doc.id}/token`,
      { method: "POST" },
    );
    if (!data) return;
    const url = String(data.url ?? "");
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Secure link copied to clipboard");
    } catch {
      setNotice(`Secure link: ${url}`);
    }
    router.refresh();
  }

  async function revokeAccess(doc: ClientDocument) {
    if (
      !window.confirm(
        "Revoke access? Existing customer links stop working immediately.",
      )
    ) {
      return;
    }
    const data = await api(
      `/api/projects/${projectId}/documents/${doc.id}/token`,
      { method: "DELETE" },
    );
    if (!data) return;
    setNotice("Access revoked");
    router.refresh();
  }

  async function submitSend(e: FormEvent) {
    e.preventDefault();
    if (!sendDoc) return;
    const data = await api(
      `/api/projects/${projectId}/documents/${sendDoc.id}/send`,
      {
        method: "POST",
        body: JSON.stringify({ to: sendTo, message: sendMessage }),
      },
    );
    if (!data) return;
    setSendDoc(null);
    setSendTo("");
    setSendMessage("");
    if (data.emailed) {
      setNotice("Document sent by email");
    } else {
      const url = String(data.url ?? "");
      try {
        await navigator.clipboard.writeText(url);
        setNotice(
          `Marked as sent. Email is not configured — secure link copied to clipboard.`,
        );
      } catch {
        setNotice(`Marked as sent. Secure link: ${url}`);
      }
    }
    router.refresh();
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <strong>Client Documents</strong>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            Customer-facing proposals and quotes with secure links, e-sign, and
            PDF download. Only sale prices are ever shown to customers.
          </p>
        </div>
        {canEdit ? (
          <button
            className="btn btn-primary"
            onClick={() => setShowCreate((v) => !v)}
          >
            New document
          </button>
        ) : null}
      </div>

      {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
      {notice ? <p className="muted">{notice}</p> : null}

      {showCreate ? (
        <form
          className="table-wrap panel-light"
          style={{ padding: "1rem" }}
          onSubmit={createDocument}
        >
          <div className="row" style={{ gap: "0.75rem", alignItems: "end", flexWrap: "wrap" }}>
            <div>
              <label className="label">Type</label>
              <select
                className="field-light"
                value={newType}
                onChange={(e) =>
                  setNewType(e.target.value as ClientDocumentType)
                }
              >
                {CREATABLE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CLIENT_DOCUMENT_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label className="label">Document name</label>
              <input
                className="field-light"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Conference Room AV Proposal"
                required
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              Create & edit
            </button>
          </div>
        </form>
      ) : null}

      {sendDoc ? (
        <form
          className="table-wrap panel-light"
          style={{ padding: "1rem" }}
          onSubmit={submitSend}
        >
          <strong>Send “{sendDoc.name}”</strong>
          <div className="row" style={{ gap: "0.75rem", alignItems: "end", flexWrap: "wrap", marginTop: "0.6rem" }}>
            <div style={{ minWidth: 260 }}>
              <label className="label">Recipient email</label>
              <input
                className="field-light"
                type="email"
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
                placeholder="Defaults to the project client's email"
              />
            </div>
            <div style={{ flex: 1, minWidth: 260 }}>
              <label className="label">Message (optional)</label>
              <input
                className="field-light"
                value={sendMessage}
                onChange={(e) => setSendMessage(e.target.value)}
                placeholder="Short note included in the email"
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              Send
            </button>
            <button className="btn" type="button" onClick={() => setSendDoc(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className="table-wrap">
        <table className="bom-table">
          <thead>
            <tr>
              <th>Document</th>
              <th>Type</th>
              <th>Customer</th>
              <th>Ver</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}>Total</th>
              <th style={{ textAlign: "right" }}>Paid</th>
              <th style={{ textAlign: "right" }}>Balance</th>
              <th>Sent</th>
              <th>Expires</th>
              <th>Last customer activity</th>
              <th>Created</th>
              <th>Assigned</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 ? (
              <tr>
                <td colSpan={14} className="muted" style={{ padding: "1rem" }}>
                  No client documents yet.
                  {canEdit ? " Create one to get started." : ""}
                </td>
              </tr>
            ) : (
              documents.map((doc) => {
                const balance = (doc.total ?? 0) - (doc.amount_paid ?? 0);
                const hasLink = activeToken.has(doc.id);
                const archived = Boolean(doc.archived_at);
                return (
                  <tr key={doc.id} style={archived ? { opacity: 0.55 } : undefined}>
                    <td>
                      <Link
                        href={`/projects/${projectId}/documents/${doc.id}`}
                        style={{ fontWeight: 650 }}
                      >
                        {doc.name}
                      </Link>
                      <div className="muted" style={{ fontSize: "0.78rem" }}>
                        {doc.doc_number}
                        {archived ? " · archived" : ""}
                      </div>
                    </td>
                    <td>{CLIENT_DOCUMENT_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}</td>
                    <td>{clientName ?? "—"}</td>
                    <td>v{doc.version}</td>
                    <td>
                      <span className={statusBadgeClass(doc.status)}>
                        {CLIENT_DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>{formatMoney(doc.total)}</td>
                    <td style={{ textAlign: "right" }}>{formatMoney(doc.amount_paid)}</td>
                    <td style={{ textAlign: "right" }}>{formatMoney(balance)}</td>
                    <td>{shortDate(doc.sent_at)}</td>
                    <td>{shortDate(doc.expires_at)}</td>
                    <td className="muted">
                      {lastCustomerActivity.get(doc.id) ?? "—"}
                    </td>
                    <td className="muted">
                      {userName(doc.created_by)}
                      <div style={{ fontSize: "0.78rem" }}>
                        {shortDate(doc.created_at)}
                      </div>
                    </td>
                    <td className="muted">{userName(doc.assigned_to)}</td>
                    <td>
                      <OverflowMenu label="Document actions">
                        <Link
                          className="menu-item menu-item-link"
                          role="menuitem"
                          href={`/projects/${projectId}/documents/${doc.id}`}
                        >
                          {canEdit && doc.status === "draft" ? "Edit" : "Open"}
                        </Link>
                        <Link
                          className="menu-item menu-item-link"
                          role="menuitem"
                          href={`/projects/${projectId}/documents/${doc.id}?preview=1`}
                        >
                          Preview as customer
                        </Link>
                        <a
                          className="menu-item menu-item-link"
                          role="menuitem"
                          href={`/api/projects/${projectId}/documents/${doc.id}/pdf`}
                          download
                        >
                          Download PDF
                        </a>
                        {canEdit ? (
                          <>
                            <div className="menu-divider" />
                            <button
                              className="menu-item"
                              role="menuitem"
                              onClick={() => {
                                setSendDoc(doc);
                                setShowCreate(false);
                              }}
                              disabled={busy || archived}
                            >
                              Send…
                            </button>
                            <button
                              className="menu-item"
                              role="menuitem"
                              onClick={() => void copyLink(doc)}
                              disabled={busy || archived}
                            >
                              Copy secure link
                            </button>
                            {hasLink ? (
                              <button
                                className="menu-item"
                                role="menuitem"
                                onClick={() => void revokeAccess(doc)}
                                disabled={busy}
                              >
                                Revoke access
                              </button>
                            ) : null}
                            <div className="menu-divider" />
                            <button
                              className="menu-item"
                              role="menuitem"
                              onClick={() => void duplicate(doc, false)}
                              disabled={busy}
                            >
                              Duplicate
                            </button>
                            <button
                              className="menu-item"
                              role="menuitem"
                              onClick={() => void duplicate(doc, true)}
                              disabled={busy}
                            >
                              New version
                            </button>
                            <div className="menu-divider" />
                            {doc.status !== "voided" ? (
                              <button
                                className="menu-item"
                                role="menuitem"
                                onClick={() =>
                                  void patchDocument(
                                    doc,
                                    { status: "voided" },
                                    "Document voided",
                                  )
                                }
                                disabled={busy}
                              >
                                Void
                              </button>
                            ) : null}
                            <button
                              className="menu-item"
                              role="menuitem"
                              onClick={() =>
                                void patchDocument(
                                  doc,
                                  { archived: !archived },
                                  archived ? "Unarchived" : "Archived",
                                )
                              }
                              disabled={busy}
                            >
                              {archived ? "Unarchive" : "Archive"}
                            </button>
                            {doc.status === "draft" ? (
                              <button
                                className="menu-item"
                                role="menuitem"
                                onClick={() => void deleteDraft(doc)}
                                disabled={busy}
                                style={{ color: "var(--danger)" }}
                              >
                                Delete draft
                              </button>
                            ) : null}
                          </>
                        ) : null}
                      </OverflowMenu>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
