"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AppNotification } from "@/lib/types";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationsDock() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json() as { notifications?: AppNotification[] };
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
    } catch {
      // ignore transient errors
    }
  }, []);

  useEffect(() => {
    setReady(true);
    void poll();
    const id = window.setInterval(() => void poll(), 15000);
    return () => window.clearInterval(id);
  }, [poll]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  async function markRead(id: string) {
    await fetch("/api/notifications", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)),
    );
  }

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })));
  }

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  if (!ready) return null;

  return (
    <div
      ref={ref}
      className="notifications-dock"
      style={{
        position: "fixed",
        bottom: "1.25rem",
        left: "1.25rem",
        zIndex: 1000,
      }}
    >
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        aria-expanded={open}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: "var(--bg, #fff)",
          border: "1px solid var(--line, #e5e7eb)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          cursor: "pointer",
          fontSize: "1.1rem",
          color: "var(--fg, #111)",
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              background: "var(--red, #ef4444)",
              color: "#fff",
              fontSize: "0.65rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 3px",
              lineHeight: 1,
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Popover panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: 0,
            width: 320,
            maxHeight: 420,
            background: "var(--bg, #fff)",
            border: "1px solid var(--line, #e5e7eb)",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.6rem 0.9rem",
              borderBottom: "1px solid var(--line, #e5e7eb)",
              flexShrink: 0,
            }}
          >
            <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  color: "var(--blue, #3b82f6)",
                  padding: 0,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {notifications.length === 0 ? (
              <div
                style={{
                  padding: "1.5rem 1rem",
                  textAlign: "center",
                  fontSize: "0.82rem",
                  color: "var(--muted)",
                }}
              >
                No notifications
              </div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {notifications.map((n) => {
                  const isUnread = !n.read_at;
                  const inner = (
                    <div
                      style={{
                        padding: "0.6rem 0.9rem",
                        borderBottom: "1px solid var(--line, #e5e7eb)",
                        background: isUnread ? "var(--surface, #f8f8f8)" : undefined,
                        cursor: "pointer",
                      }}
                      onClick={() => { if (isUnread) void markRead(n.id); }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: "0.5rem",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.82rem",
                            fontWeight: isUnread ? 600 : 400,
                            flex: 1,
                            lineHeight: 1.4,
                          }}
                        >
                          {isUnread && (
                            <span
                              aria-hidden
                              style={{
                                display: "inline-block",
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: "var(--blue, #3b82f6)",
                                marginRight: 6,
                                verticalAlign: "middle",
                                flexShrink: 0,
                              }}
                            />
                          )}
                          {n.title}
                        </span>
                        <span
                          style={{
                            fontSize: "0.72rem",
                            color: "var(--muted)",
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                        >
                          {n.created_at ? timeAgo(n.created_at) : ""}
                        </span>
                      </div>
                      {n.body && (
                        <div
                          style={{
                            fontSize: "0.78rem",
                            color: "var(--muted)",
                            marginTop: "0.2rem",
                            paddingLeft: isUnread ? 12 : 0,
                          }}
                        >
                          {n.body}
                        </div>
                      )}
                    </div>
                  );

                  return (
                    <li key={n.id}>
                      {n.href ? (
                        <Link
                          href={n.href}
                          style={{ textDecoration: "none", color: "inherit", display: "block" }}
                          onClick={() => { if (isUnread) void markRead(n.id); setOpen(false); }}
                        >
                          {inner}
                        </Link>
                      ) : (
                        inner
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
