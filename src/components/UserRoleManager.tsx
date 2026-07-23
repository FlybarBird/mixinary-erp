"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  USER_ROLE_LABELS,
  USER_ROLES,
  type UserProfile,
  type UserRole,
} from "@/lib/types";

export function UserRoleManager({
  initialUsers,
}: {
  initialUsers: UserProfile[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function setRole(id: string, role: UserRole) {
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, role }),
    });
    const data = await res.json();
    setMessage(res.ok ? "Role updated" : data.error || "Update failed");
    router.refresh();
  }

  return (
    <div className="stack">
      {message ? <p className="muted">{message}</p> : null}
      <div className="table-wrap panel-light">
        <table className="bom-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {initialUsers.map((user) => (
              <tr key={user.id}>
                <td>{user.full_name}</td>
                <td>{user.email}</td>
                <td>
                  <select
                    className="field-light"
                    value={user.role}
                    onChange={(e) =>
                      setRole(user.id, e.target.value as UserRole)
                    }
                  >
                    {USER_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {USER_ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
