"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PROJECT_ACCESS_LABELS,
  PROJECT_ACCESS_ROLES,
  type ProjectAccessRole,
  type ProjectMember,
  type UserProfile,
} from "@/lib/types";

export function ProjectMembersPanel({
  projectId,
  initialMembers,
  users,
  canManage,
}: {
  projectId: string;
  initialMembers: ProjectMember[];
  users: UserProfile[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const availableUsers = useMemo(() => {
    const memberIds = new Set(members.map((m) => m.user_id));
    return users.filter((u) => u.active !== false && !memberIds.has(u.id));
  }, [members, users]);

  async function refreshFrom(res: Response) {
    const data = await res.json();
    if (res.ok && data.members) {
      setMembers(data.members);
      router.refresh();
    }
    return data;
  }

  async function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canManage) return;
    const form = new FormData(e.currentTarget);
    setLoading(true);
    setMessage(null);
    const res = await fetch(`/api/projects/${projectId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: form.get("user_id"),
        access_role: form.get("access_role"),
      }),
    });
    const data = await refreshFrom(res);
    setLoading(false);
    setMessage(res.ok ? "Member added" : data.error || "Failed");
    if (res.ok) e.currentTarget.reset();
  }

  async function setRole(memberId: string, access_role: ProjectAccessRole) {
    setLoading(true);
    const res = await fetch(`/api/projects/${projectId}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: memberId, access_role }),
    });
    const data = await refreshFrom(res);
    setLoading(false);
    setMessage(res.ok ? "Access updated" : data.error || "Failed");
  }

  async function remove(memberId: string) {
    if (!confirm("Remove this member from the project?")) return;
    setLoading(true);
    const res = await fetch(
      `/api/projects/${projectId}/members?member_id=${encodeURIComponent(memberId)}`,
      { method: "DELETE" },
    );
    const data = await refreshFrom(res);
    setLoading(false);
    setMessage(res.ok ? "Member removed" : data.error || "Failed");
  }

  return (
    <div className="panel-light" style={{ padding: "0.75rem 1rem" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong style={{ fontSize: "0.9rem" }}>
          Members ({members.length})
        </strong>
        <button
          type="button"
          className="btn"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide" : "Manage"}
        </button>
      </div>

      {open ? (
        <div className="stack" style={{ marginTop: "0.75rem", gap: "0.65rem" }}>
          {message ? <p className="muted" style={{ margin: 0 }}>{message}</p> : null}
          <div className="table-wrap">
            <table className="bom-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Access</th>
                  {canManage ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.user_profiles?.full_name || m.user_profiles?.email || m.user_id}
                      {m.user_profiles?.email ? (
                        <div className="muted" style={{ fontSize: "0.8rem" }}>
                          {m.user_profiles.email}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {canManage ? (
                        <select
                          className="field-light"
                          value={m.access_role}
                          disabled={loading}
                          onChange={(e) =>
                            void setRole(
                              m.id,
                              e.target.value as ProjectAccessRole,
                            )
                          }
                        >
                          {PROJECT_ACCESS_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {PROJECT_ACCESS_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        PROJECT_ACCESS_LABELS[m.access_role]
                      )}
                    </td>
                    {canManage ? (
                      <td>
                        <button
                          type="button"
                          className="btn"
                          disabled={loading}
                          onClick={() => void remove(m.id)}
                        >
                          Remove
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canManage ? (
            <form className="row" onSubmit={onAdd} style={{ flexWrap: "wrap" }}>
              <select
                className="field-light"
                name="user_id"
                required
                defaultValue=""
                style={{ minWidth: "12rem" }}
              >
                <option value="" disabled>
                  Select user…
                </option>
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.email} ({u.email})
                  </option>
                ))}
              </select>
              <select
                className="field-light"
                name="access_role"
                defaultValue="viewer"
              >
                {PROJECT_ACCESS_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {PROJECT_ACCESS_LABELS[r]}
                  </option>
                ))}
              </select>
              <button className="btn btn-primary" type="submit" disabled={loading}>
                Add
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
