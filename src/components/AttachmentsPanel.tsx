"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Attachment } from "@/lib/types";

interface Props {
  projectId: string;
  entityType: string;
  entityId: string;
  canUpload?: boolean;
}

export function AttachmentsPanel({ projectId, entityType, entityId, canUpload = false }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const base = `/api/projects/${projectId}/attachments`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${base}?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`,
        { credentials: "include" },
      );
      const json = await res.json() as { attachments?: Attachment[] };
      setAttachments(json.attachments ?? []);
    } catch {
      setError("Failed to load attachments");
    } finally {
      setLoading(false);
    }
  }, [base, entityType, entityId]);

  useEffect(() => { void load(); }, [load]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("entity_type", entityType);
      form.append("entity_id", entityId);
      const res = await fetch(base, { method: "POST", body: form, credentials: "include" });
      if (!res.ok) {
        const j = await res.json() as { error?: string };
        throw new Error(j.error ?? "Upload failed");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this attachment?")) return;
    try {
      await fetch(`${base}/${id}`, { method: "DELETE", credentials: "include" });
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    } catch {
      setError("Delete failed");
    }
  }

  function formatDate(s?: string) {
    if (!s) return "";
    return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div style={{ marginTop: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
        <h4 style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600, color: "var(--muted)" }}>
          Attachments
        </h4>
        {canUpload && (
          <label style={{ cursor: "pointer", fontSize: "0.8rem", color: "var(--blue, #3b82f6)" }}>
            {uploading ? "Uploading…" : "+ Add file"}
            <input
              ref={fileRef}
              type="file"
              style={{ display: "none" }}
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
        )}
      </div>

      {error && (
        <div style={{ fontSize: "0.8rem", color: "var(--red, #c00)", marginBottom: "0.5rem" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Loading…</div>
      ) : attachments.length === 0 ? (
        <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>No attachments yet.</div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          {attachments.map((a) => (
            <li
              key={a.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.82rem",
                padding: "0.3rem 0.5rem",
                background: "var(--surface, #f8f8f8)",
                borderRadius: 4,
              }}
            >
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <a
                  href={`/api/projects/${projectId}/attachments/${a.id}/file`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--blue, #3b82f6)", textDecoration: "none" }}
                >
                  {a.file_name}
                </a>
              </span>
              <span style={{ color: "var(--muted)", whiteSpace: "nowrap", flexShrink: 0 }}>
                {formatDate(a.created_at)}
              </span>
              {canUpload && (
                <button
                  type="button"
                  onClick={() => void handleDelete(a.id)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--muted)",
                    padding: "0 0.25rem",
                    fontSize: "0.9rem",
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                  title="Delete"
                  aria-label="Delete attachment"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
