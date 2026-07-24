"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Client } from "@/lib/types";

type Draft = {
  name: string;
  code: string;
  contact_name: string;
  email: string;
  phone: string;
  website: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  notes: string;
  active: boolean;
};

const emptyDraft = (): Draft => ({
  name: "",
  code: "",
  contact_name: "",
  email: "",
  phone: "",
  website: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  postal_code: "",
  notes: "",
  active: true,
});

function toDraft(c: Client): Draft {
  return {
    name: c.name ?? "",
    code: c.code ?? "",
    contact_name: c.contact_name ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    website: c.website ?? "",
    address_line1: c.address_line1 ?? "",
    address_line2: c.address_line2 ?? "",
    city: c.city ?? "",
    state: c.state ?? "",
    postal_code: c.postal_code ?? "",
    notes: c.notes ?? "",
    active: c.active !== false && c.active !== (0 as unknown as boolean),
  };
}

function draftToBody(d: Draft) {
  return {
    name: d.name.trim(),
    code: d.code.trim() || null,
    contact_name: d.contact_name.trim() || null,
    email: d.email.trim() || null,
    phone: d.phone.trim() || null,
    website: d.website.trim() || null,
    address_line1: d.address_line1.trim() || null,
    address_line2: d.address_line2.trim() || null,
    city: d.city.trim() || null,
    state: d.state.trim() || null,
    postal_code: d.postal_code.trim() || null,
    notes: d.notes.trim() || null,
    active: d.active,
  };
}

function formatAddress(c: Client | Draft) {
  const parts = [
    c.address_line1,
    c.address_line2,
    [c.city, c.state].filter(Boolean).join(", "),
    c.postal_code,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

function isActive(c: Client) {
  return c.active !== false && (c as { active?: unknown }).active !== 0;
}

export function ClientManager({
  initialClients,
  projectCounts,
  canEdit,
}: {
  initialClients: Client[];
  projectCounts: Record<string, number>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [clients, setClients] = useState(initialClients);
  const [counts, setCounts] = useState(projectCounts);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setClients(initialClients);
  }, [initialClients]);

  useEffect(() => {
    setCounts(projectCounts);
  }, [projectCounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (!showInactive && !isActive(c)) return false;
      if (!q) return true;
      const hay = [
        c.name,
        c.code,
        c.contact_name,
        c.email,
        c.phone,
        c.city,
        c.state,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [clients, search, showInactive]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draftToBody(draft)),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Failed to add client");
      return;
    }
    setDraft(emptyDraft());
    if (data.data) {
      setClients((prev) =>
        [...prev, data.data as Client].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
    }
    router.refresh();
  }

  function startEdit(client: Client) {
    setEditingId(client.id);
    setEditDraft(toDraft(client));
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(emptyDraft());
  }

  async function saveEdit(id: string) {
    if (!canEdit || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/clients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...draftToBody(editDraft) }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Failed to update client");
      return;
    }
    const updated = data.data as Client;
    setClients((prev) =>
      prev
        .map((c) => (c.id === id ? updated : c))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
    cancelEdit();
    router.refresh();
  }

  async function removeClient(client: Client) {
    if (!canEdit || busy) return;
    const n = counts[client.id] ?? 0;
    const ok = window.confirm(
      n > 0
        ? `Delete “${client.name}”? ${n} project${n === 1 ? "" : "s"} will be unlinked (client cleared).`
        : `Delete “${client.name}”?`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/clients?id=${encodeURIComponent(client.id)}`, {
      method: "DELETE",
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Failed to delete client");
      return;
    }
    setClients((prev) => prev.filter((c) => c.id !== client.id));
    setCounts((prev) => {
      const next = { ...prev };
      delete next[client.id];
      return next;
    });
    if (editingId === client.id) cancelEdit();
    router.refresh();
  }

  return (
    <div className="stack">
      <div className="row" style={{ gap: "0.75rem", flexWrap: "wrap" }}>
        <input
          className="field"
          style={{ maxWidth: 280 }}
          placeholder="Search name, code, contact…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="row" style={{ gap: "0.4rem", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          <span className="label" style={{ margin: 0 }}>
            Show inactive
          </span>
        </label>
        <a className="btn" href="/api/clients/export">
          Export CSV
        </a>
      </div>

      {canEdit ? (
        <form className="panel" style={{ padding: "1rem" }} onSubmit={onCreate}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: "0.65rem",
            }}
          >
            <input
              className="field"
              placeholder="Name *"
              required
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
            <input
              className="field"
              placeholder="Code"
              value={draft.code}
              onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
            />
            <input
              className="field"
              placeholder="Contact"
              value={draft.contact_name}
              onChange={(e) =>
                setDraft((d) => ({ ...d, contact_name: e.target.value }))
              }
            />
            <input
              className="field"
              placeholder="Email"
              type="email"
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
            />
            <input
              className="field"
              placeholder="Phone"
              value={draft.phone}
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
            />
            <input
              className="field"
              placeholder="Website"
              value={draft.website}
              onChange={(e) =>
                setDraft((d) => ({ ...d, website: e.target.value }))
              }
            />
            <input
              className="field"
              placeholder="Address line 1"
              value={draft.address_line1}
              onChange={(e) =>
                setDraft((d) => ({ ...d, address_line1: e.target.value }))
              }
            />
            <input
              className="field"
              placeholder="Address line 2"
              value={draft.address_line2}
              onChange={(e) =>
                setDraft((d) => ({ ...d, address_line2: e.target.value }))
              }
            />
            <input
              className="field"
              placeholder="City"
              value={draft.city}
              onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))}
            />
            <input
              className="field"
              placeholder="State"
              value={draft.state}
              onChange={(e) => setDraft((d) => ({ ...d, state: e.target.value }))}
            />
            <input
              className="field"
              placeholder="Postal code"
              value={draft.postal_code}
              onChange={(e) =>
                setDraft((d) => ({ ...d, postal_code: e.target.value }))
              }
            />
            <input
              className="field"
              placeholder="Notes"
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            />
          </div>
          <div className="row" style={{ marginTop: "0.75rem", gap: "0.65rem" }}>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              Add client
            </button>
            {error ? (
              <span style={{ color: "var(--danger)" }}>{error}</span>
            ) : null}
          </div>
        </form>
      ) : null}

      <div className="table-wrap panel-light">
        <table className="bom-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Contact</th>
              <th>Email / Phone</th>
              <th>Address</th>
              <th>Projects</th>
              <th>Status</th>
              <th style={{ width: 200 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const editing = editingId === c.id;
              const n = counts[c.id] ?? 0;
              return (
                <tr key={c.id} style={{ opacity: isActive(c) ? 1 : 0.7 }}>
                  <td>
                    {editing ? (
                      <input
                        className="field"
                        value={editDraft.name}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, name: e.target.value }))
                        }
                      />
                    ) : (
                      <Link href={`/clients/${c.id}`}>{c.name}</Link>
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <input
                        className="field"
                        value={editDraft.code}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, code: e.target.value }))
                        }
                      />
                    ) : (
                      c.code || "—"
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <input
                        className="field"
                        value={editDraft.contact_name}
                        onChange={(e) =>
                          setEditDraft((d) => ({
                            ...d,
                            contact_name: e.target.value,
                          }))
                        }
                      />
                    ) : (
                      c.contact_name || "—"
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <div className="stack" style={{ gap: "0.35rem" }}>
                        <input
                          className="field"
                          placeholder="Email"
                          value={editDraft.email}
                          onChange={(e) =>
                            setEditDraft((d) => ({
                              ...d,
                              email: e.target.value,
                            }))
                          }
                        />
                        <input
                          className="field"
                          placeholder="Phone"
                          value={editDraft.phone}
                          onChange={(e) =>
                            setEditDraft((d) => ({
                              ...d,
                              phone: e.target.value,
                            }))
                          }
                        />
                      </div>
                    ) : (
                      <span style={{ fontSize: "0.85rem" }}>
                        {c.email || "—"}
                        <br />
                        {c.phone || "—"}
                      </span>
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <div className="stack" style={{ gap: "0.35rem" }}>
                        <input
                          className="field"
                          placeholder="Address 1"
                          value={editDraft.address_line1}
                          onChange={(e) =>
                            setEditDraft((d) => ({
                              ...d,
                              address_line1: e.target.value,
                            }))
                          }
                        />
                        <input
                          className="field"
                          placeholder="City"
                          value={editDraft.city}
                          onChange={(e) =>
                            setEditDraft((d) => ({
                              ...d,
                              city: e.target.value,
                            }))
                          }
                        />
                        <div className="row" style={{ gap: "0.35rem" }}>
                          <input
                            className="field"
                            placeholder="ST"
                            style={{ maxWidth: 60 }}
                            value={editDraft.state}
                            onChange={(e) =>
                              setEditDraft((d) => ({
                                ...d,
                                state: e.target.value,
                              }))
                            }
                          />
                          <input
                            className="field"
                            placeholder="ZIP"
                            value={editDraft.postal_code}
                            onChange={(e) =>
                              setEditDraft((d) => ({
                                ...d,
                                postal_code: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>
                    ) : (
                      <span style={{ fontSize: "0.85rem" }}>
                        {formatAddress(c)}
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: "center" }}>{n}</td>
                  <td>
                    {editing ? (
                      <label
                        className="row"
                        style={{ gap: "0.35rem", alignItems: "center" }}
                      >
                        <input
                          type="checkbox"
                          checked={editDraft.active}
                          onChange={(e) =>
                            setEditDraft((d) => ({
                              ...d,
                              active: e.target.checked,
                            }))
                          }
                        />
                        Active
                      </label>
                    ) : isActive(c) ? (
                      <span className="badge">Active</span>
                    ) : (
                      <span className="badge" style={{ opacity: 0.7 }}>
                        Inactive
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="row" style={{ gap: "0.35rem" }}>
                      {editing ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={busy}
                            onClick={() => void saveEdit(c.id)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn"
                            disabled={busy}
                            onClick={cancelEdit}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <Link className="btn" href={`/clients/${c.id}`}>
                            View
                          </Link>
                          {canEdit ? (
                            <>
                              <button
                                type="button"
                                className="btn"
                                disabled={busy}
                                onClick={() => startEdit(c)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn"
                                disabled={busy}
                                onClick={() => void removeClient(c)}
                              >
                                Delete
                              </button>
                            </>
                          ) : null}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filtered.length ? (
              <tr>
                <td colSpan={8}>
                  {clients.length
                    ? "No clients match your filters."
                    : "No clients yet. Add your first church, school, or install customer above."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {error && !canEdit ? (
        <p style={{ color: "var(--danger)" }}>{error}</p>
      ) : null}
    </div>
  );
}
