"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { Client, ProjectStatus } from "@/lib/types";

type LinkedProject = {
  id: string;
  project_number: string;
  name: string;
  status: ProjectStatus;
  project_manager_name: string | null;
};

function isActive(c: Client) {
  return c.active !== false && (c as { active?: unknown }).active !== 0;
}

export function ClientDetailView({
  initialClient,
  projects,
  canEdit,
}: {
  initialClient: Client;
  projects: LinkedProject[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [client, setClient] = useState(initialClient);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    name: initialClient.name ?? "",
    code: initialClient.code ?? "",
    contact_name: initialClient.contact_name ?? "",
    email: initialClient.email ?? "",
    phone: initialClient.phone ?? "",
    website: initialClient.website ?? "",
    address_line1: initialClient.address_line1 ?? "",
    address_line2: initialClient.address_line2 ?? "",
    city: initialClient.city ?? "",
    state: initialClient.state ?? "",
    postal_code: initialClient.postal_code ?? "",
    notes: initialClient.notes ?? "",
    active: isActive(initialClient),
  });

  function startEdit() {
    setDraft({
      name: client.name ?? "",
      code: client.code ?? "",
      contact_name: client.contact_name ?? "",
      email: client.email ?? "",
      phone: client.phone ?? "",
      website: client.website ?? "",
      address_line1: client.address_line1 ?? "",
      address_line2: client.address_line2 ?? "",
      city: client.city ?? "",
      state: client.state ?? "",
      postal_code: client.postal_code ?? "",
      notes: client.notes ?? "",
      active: isActive(client),
    });
    setEditing(true);
    setError(null);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!canEdit || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/clients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: client.id,
        name: draft.name.trim(),
        code: draft.code.trim() || null,
        contact_name: draft.contact_name.trim() || null,
        email: draft.email.trim() || null,
        phone: draft.phone.trim() || null,
        website: draft.website.trim() || null,
        address_line1: draft.address_line1.trim() || null,
        address_line2: draft.address_line2.trim() || null,
        city: draft.city.trim() || null,
        state: draft.state.trim() || null,
        postal_code: draft.postal_code.trim() || null,
        notes: draft.notes.trim() || null,
        active: draft.active,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Failed to save");
      return;
    }
    setClient(data.data as Client);
    setEditing(false);
    router.refresh();
  }

  async function onDelete() {
    if (!canEdit || busy) return;
    const n = projects.length;
    const ok = window.confirm(
      n > 0
        ? `Delete “${client.name}”? ${n} project${n === 1 ? "" : "s"} will be unlinked.`
        : `Delete “${client.name}”?`,
    );
    if (!ok) return;
    setBusy(true);
    const res = await fetch(
      `/api/clients?id=${encodeURIComponent(client.id)}`,
      { method: "DELETE" },
    );
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Failed to delete");
      return;
    }
    router.push("/clients");
    router.refresh();
  }

  const address = [
    client.address_line1,
    client.address_line2,
    [client.city, client.state].filter(Boolean).join(", "),
    client.postal_code,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between", gap: "0.75rem" }}>
        <div>
          <p className="page-sub" style={{ marginBottom: "0.25rem" }}>
            <Link href="/clients">Clients</Link>
            {" / "}
            {client.name}
          </p>
          <h1 className="page-title" style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            {client.name}
            {!isActive(client) ? (
              <span className="badge" style={{ fontSize: "0.75rem" }}>
                Inactive
              </span>
            ) : null}
          </h1>
          {client.code ? (
            <p className="page-sub">Code {client.code}</p>
          ) : null}
        </div>
        {canEdit && !editing ? (
          <div className="row" style={{ gap: "0.5rem" }}>
            <button type="button" className="btn" onClick={startEdit}>
              Edit
            </button>
            <button
              type="button"
              className="btn"
              style={{ color: "var(--danger)" }}
              disabled={busy}
              onClick={() => void onDelete()}
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <form className="panel" style={{ padding: "1rem" }} onSubmit={onSave}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: "0.65rem",
            }}
          >
            {(
              [
                ["name", "Name *", true],
                ["code", "Code", false],
                ["contact_name", "Contact", false],
                ["email", "Email", false],
                ["phone", "Phone", false],
                ["website", "Website", false],
                ["address_line1", "Address line 1", false],
                ["address_line2", "Address line 2", false],
                ["city", "City", false],
                ["state", "State", false],
                ["postal_code", "Postal code", false],
              ] as const
            ).map(([key, label, required]) => (
              <label key={key}>
                <div className="label">{label}</div>
                <input
                  className="field"
                  required={required}
                  value={draft[key]}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [key]: e.target.value }))
                  }
                />
              </label>
            ))}
            <label style={{ gridColumn: "1 / -1" }}>
              <div className="label">Notes</div>
              <textarea
                className="field"
                rows={3}
                value={draft.notes}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, notes: e.target.value }))
                }
              />
            </label>
            <label className="row" style={{ gap: "0.4rem", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, active: e.target.checked }))
                }
              />
              <span className="label" style={{ margin: 0 }}>
                Active (shown in project pickers)
              </span>
            </label>
          </div>
          <div className="row" style={{ marginTop: "0.85rem", gap: "0.5rem" }}>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            {error ? (
              <span style={{ color: "var(--danger)" }}>{error}</span>
            ) : null}
          </div>
        </form>
      ) : (
        <div className="panel" style={{ padding: "1rem" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "1rem",
            }}
          >
            <div>
              <div className="label">Contact</div>
              <div>{client.contact_name || "—"}</div>
            </div>
            <div>
              <div className="label">Email</div>
              <div>
                {client.email ? (
                  <a href={`mailto:${client.email}`}>{client.email}</a>
                ) : (
                  "—"
                )}
              </div>
            </div>
            <div>
              <div className="label">Phone</div>
              <div>{client.phone || "—"}</div>
            </div>
            <div>
              <div className="label">Website</div>
              <div>
                {client.website ? (
                  <a href={client.website} target="_blank" rel="noreferrer">
                    {client.website}
                  </a>
                ) : (
                  "—"
                )}
              </div>
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <div className="label">Address</div>
              <div style={{ whiteSpace: "pre-line" }}>{address || "—"}</div>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <div className="label">Notes</div>
              <div>{client.notes || "—"}</div>
            </div>
          </div>
        </div>
      )}

      <div>
        <h2 className="page-title" style={{ fontSize: "1.15rem" }}>
          Projects ({projects.length})
        </h2>
        <div className="table-wrap panel-light">
          <table className="bom-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Name</th>
                <th>Status</th>
                <th>PM</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/projects/${p.id}`}>{p.project_number}</Link>
                  </td>
                  <td>
                    <Link href={`/projects/${p.id}`}>{p.name}</Link>
                  </td>
                  <td>{p.status}</td>
                  <td>{p.project_manager_name || "—"}</td>
                </tr>
              ))}
              {!projects.length ? (
                <tr>
                  <td colSpan={4}>No projects linked to this client.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
