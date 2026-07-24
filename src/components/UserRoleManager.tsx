"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  USER_ROLE_LABELS,
  USER_ROLES,
  type UserProfile,
} from "@/lib/types";

type AuditRow = {
  id: string;
  actor_id: string | null;
  target_user_id: string | null;
  action: string;
  details: string | Record<string, unknown> | null;
  created_at: string;
};

export function UserManager({
  initialUsers,
  initialAudit = [],
}: {
  initialUsers: UserProfile[];
  initialAudit?: AuditRow[];
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [audit, setAudit] = useState(initialAudit);
  const [filter, setFilter] = useState<"active" | "deactivated" | "all">(
    "active",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const active = u.active !== false;
      if (filter === "active") return active;
      if (filter === "deactivated") return !active;
      return true;
    });
  }, [users, filter]);

  async function reload() {
    const res = await fetch("/api/users?active=all&audit=1");
    const data = await res.json();
    if (res.ok) {
      setUsers(data.users ?? []);
      setAudit(data.audit ?? []);
    }
    router.refresh();
  }

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") || "").trim();
    setLoading(true);
    setMessage(null);
    setInviteUrl(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        full_name: form.get("full_name"),
        role: form.get("role"),
        password: password || null,
        invite: !password,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(data.error || "Create failed");
      return;
    }
    if (data.inviteUrl && !data.emailed) {
      setInviteUrl(data.inviteUrl);
      setMessage("Invite created — copy the link below (SMTP not configured).");
    } else if (data.inviteUrl && data.emailed) {
      setMessage("Invite email sent.");
    } else {
      setMessage("User created.");
    }
    e.currentTarget.reset();
    await reload();
  }

  async function saveEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") || "").trim();
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editing.id,
        full_name: form.get("full_name"),
        email: form.get("email"),
        role: form.get("role"),
        password: password || null,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(data.error || "Update failed");
      return;
    }
    setMessage(password ? "User updated (password reset)." : "User updated.");
    setEditing(null);
    await reload();
  }

  async function setActive(user: UserProfile, active: boolean) {
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id, active }),
    });
    const data = await res.json();
    setLoading(false);
    setMessage(res.ok ? (active ? "User reactivated" : "User deactivated") : data.error);
    if (res.ok) await reload();
  }

  async function hardDelete(user: UserProfile) {
    if (!confirm(`Permanently delete ${user.email}?`)) return;
    setLoading(true);
    const res = await fetch(
      `/api/users?id=${encodeURIComponent(user.id)}&hard=1`,
      { method: "DELETE" },
    );
    const data = await res.json();
    setLoading(false);
    setMessage(res.ok ? "User deleted" : data.error || "Delete failed");
    if (res.ok) await reload();
  }

  return (
    <div className="stack">
      {message ? <p className="muted">{message}</p> : null}
      {inviteUrl ? (
        <div className="panel-light" style={{ padding: "0.75rem 1rem" }}>
          <label className="label">Invite link</label>
          <div className="row">
            <input className="field-light" readOnly value={inviteUrl} style={{ flex: 1 }} />
            <button
              type="button"
              className="btn"
              onClick={() => void navigator.clipboard.writeText(inviteUrl)}
            >
              Copy
            </button>
          </div>
        </div>
      ) : null}

      <form className="panel" style={{ padding: "1rem" }} onSubmit={onCreate}>
        <h2 className="section-title" style={{ marginTop: 0 }}>
          Create or invite
        </h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Leave password blank to send an invite (email via Resend/SMTP, or a copyable link if mail is not set).
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))",
            gap: "0.65rem",
          }}
        >
          <div>
            <label className="label">Name</label>
            <input className="field" name="full_name" />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="field" name="email" type="email" required />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="field" name="role" defaultValue="project_manager">
              {USER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {USER_ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Password (optional)</label>
            <input className="field" name="password" type="password" minLength={8} />
          </div>
        </div>
        <div className="row" style={{ marginTop: "0.75rem" }}>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Saving…" : "Create / invite"}
          </button>
        </div>
      </form>

      <div className="row" style={{ gap: "0.4rem" }}>
        {(["active", "deactivated", "all"] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`btn ${filter === f ? "btn-active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="table-wrap panel-light">
        <table className="bom-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((user) => {
              const active = user.active !== false;
              return (
                <tr key={user.id}>
                  <td>{user.full_name || "—"}</td>
                  <td>{user.email}</td>
                  <td>{USER_ROLE_LABELS[user.role]}</td>
                  <td>
                    <span className={`badge ${active ? "badge-active" : "badge-archived"}`}>
                      {active ? "Active" : "Deactivated"}
                    </span>
                  </td>
                  <td>
                    <div className="row" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="btn"
                        disabled={loading}
                        onClick={() => setEditing(user)}
                      >
                        Edit
                      </button>
                      {active ? (
                        <button
                          type="button"
                          className="btn"
                          disabled={loading}
                          onClick={() => void setActive(user, false)}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn"
                            disabled={loading}
                            onClick={() => void setActive(user, true)}
                          >
                            Reactivate
                          </button>
                          <button
                            type="button"
                            className="btn"
                            disabled={loading}
                            onClick={() => void hardDelete(user)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing ? (
        <form className="panel" style={{ padding: "1rem" }} onSubmit={saveEdit}>
          <h2 className="section-title" style={{ marginTop: 0 }}>
            Edit {editing.email}
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))",
              gap: "0.65rem",
            }}
          >
            <div>
              <label className="label">Name</label>
              <input
                className="field"
                name="full_name"
                defaultValue={editing.full_name ?? ""}
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input
                className="field"
                name="email"
                type="email"
                required
                defaultValue={editing.email}
              />
            </div>
            <div>
              <label className="label">Role</label>
              <select
                className="field"
                name="role"
                defaultValue={editing.role}
              >
                {USER_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {USER_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Reset password</label>
              <input
                className="field"
                name="password"
                type="password"
                minLength={8}
                placeholder="Leave blank to keep"
              />
            </div>
          </div>
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              Save
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className="panel-light" style={{ padding: "0.75rem 1rem" }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>Recent audit</strong>
          <button type="button" className="btn" onClick={() => setShowAudit((v) => !v)}>
            {showAudit ? "Hide" : "Show"}
          </button>
        </div>
        {showAudit ? (
          <ul className="stack" style={{ marginTop: "0.75rem", paddingLeft: "1.1rem" }}>
            {audit.length === 0 ? (
              <li className="muted">No events yet.</li>
            ) : (
              audit.map((ev) => (
                <li key={ev.id}>
                  <span className="muted">{ev.created_at}</span> — {ev.action}
                  {ev.target_user_id ? ` → ${ev.target_user_id.slice(0, 8)}…` : ""}
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

/** @deprecated Prefer UserManager */
export function UserRoleManager(props: {
  initialUsers: UserProfile[];
  initialAudit?: AuditRow[];
}) {
  return <UserManager {...props} />;
}
