"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuditEvent } from "@/lib/types";

interface Props {
  projectId: string;
}

const ACTION_LABELS: Record<string, string> = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  approve: "Approved",
  reject: "Rejected",
  apply: "Applied",
};

function entityLabel(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function ProjectHistoryPanel({ projectId }: Props) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/audit`, { credentials: "include" });
      const json = await res.json() as { events?: AuditEvent[] };
      setEvents(json.events ?? []);
    } catch {
      setError("Failed to load history");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <div style={{ fontSize: "0.82rem", color: "var(--muted)", padding: "1rem" }}>Loading history…</div>;
  }

  if (error) {
    return <div style={{ fontSize: "0.82rem", color: "var(--red, #c00)", padding: "1rem" }}>{error}</div>;
  }

  return (
    <div>
      <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.75rem" }}>Recent Activity</h3>
      {events.length === 0 ? (
        <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>No activity recorded yet.</div>
      ) : (
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0" }}>
          {events.map((e, i) => (
            <li
              key={e.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: "0.25rem 1rem",
                padding: "0.5rem 0",
                borderBottom: i < events.length - 1 ? "1px solid var(--line, #e5e7eb)" : "none",
                fontSize: "0.82rem",
              }}
            >
              <div>
                <span style={{ fontWeight: 500 }}>{actionLabel(e.action)}</span>
                {" "}
                <span style={{ color: "var(--muted)" }}>{entityLabel(e.entity_type)}</span>
              </div>
              <div style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                {e.created_at ? timeAgo(e.created_at) : ""}
              </div>
              {e.actor_id && (
                <div style={{ color: "var(--muted)", fontSize: "0.78rem", gridColumn: "1 / -1" }}>
                  by {e.actor_id.slice(0, 8)}
                </div>
              )}
              {e.reason ? (
                <div style={{ color: "var(--muted)", fontSize: "0.78rem", gridColumn: "1 / -1" }}>
                  Reason: {e.reason}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
