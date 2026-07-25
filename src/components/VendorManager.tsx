"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Vendor } from "@/lib/types";

type Draft = {
  code: string;
  name: string;
  account_number: string;
  contact_name: string;
  contact_email: string;
  notes: string;
};

const emptyDraft = (): Draft => ({
  code: "",
  name: "",
  account_number: "",
  contact_name: "",
  contact_email: "",
  notes: "",
});

export function VendorManager({
  initialVendors,
  canEdit,
}: {
  initialVendors: Vendor[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [vendors, setVendors] = useState(initialVendors);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setVendors(initialVendors);
  }, [initialVendors]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: draft.code.trim(),
        name: draft.name.trim(),
        account_number: draft.account_number.trim() || null,
        contact_name: draft.contact_name.trim() || null,
        contact_email: draft.contact_email.trim() || null,
        notes: draft.notes.trim() || null,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Failed to add vendor");
      return;
    }
    setDraft(emptyDraft());
    if (data.data) {
      setVendors((prev) =>
        [...prev, data.data as Vendor].sort((a, b) =>
          a.code.localeCompare(b.code),
        ),
      );
    }
    router.refresh();
  }

  function startEdit(vendor: Vendor) {
    setEditingId(vendor.id);
    setEditDraft({
      code: vendor.code,
      name: vendor.name,
      account_number: vendor.account_number || "",
      contact_name: vendor.contact_name || "",
      contact_email: vendor.contact_email || "",
      notes: vendor.notes || "",
    });
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
    const res = await fetch("/api/vendors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        code: editDraft.code.trim(),
        name: editDraft.name.trim(),
        account_number: editDraft.account_number.trim() || null,
        contact_name: editDraft.contact_name.trim() || null,
        contact_email: editDraft.contact_email.trim() || null,
        notes: editDraft.notes.trim() || null,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Failed to update vendor");
      return;
    }
    const updated = data.data as Vendor;
    setVendors((prev) =>
      prev
        .map((v) => (v.id === id ? updated : v))
        .sort((a, b) => a.code.localeCompare(b.code)),
    );
    cancelEdit();
    router.refresh();
  }

  async function removeVendor(vendor: Vendor) {
    if (!canEdit || busy) return;
    const ok = window.confirm(
      `Delete vendor “${vendor.code} — ${vendor.name}”? BOM lines using it will clear the vendor.`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/vendors?id=${encodeURIComponent(vendor.id)}`, {
      method: "DELETE",
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Failed to delete vendor");
      return;
    }
    setVendors((prev) => prev.filter((v) => v.id !== vendor.id));
    if (editingId === vendor.id) cancelEdit();
    router.refresh();
  }

  const colCount = canEdit ? 7 : 6;

  return (
    <div className="stack">
      {canEdit ? (
        <form className="panel stack" style={{ padding: "1rem" }} onSubmit={onCreate}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1.4fr 1.1fr 1.2fr 1.4fr 1.4fr auto",
              gap: "0.65rem",
              alignItems: "end",
            }}
          >
            <div>
              <label className="label" htmlFor="vendor-code">
                Code
              </label>
              <input
                id="vendor-code"
                className="field"
                placeholder="SP"
                required
                value={draft.code}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, code: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="label" htmlFor="vendor-name">
                Name
              </label>
              <input
                id="vendor-name"
                className="field"
                placeholder="Name"
                required
                value={draft.name}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, name: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="label" htmlFor="vendor-account">
                Account #
              </label>
              <input
                id="vendor-account"
                className="field"
                placeholder="Account #"
                value={draft.account_number}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, account_number: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="label" htmlFor="vendor-contact-name">
                Contact
              </label>
              <input
                id="vendor-contact-name"
                className="field"
                placeholder="Contact name"
                value={draft.contact_name}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, contact_name: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="label" htmlFor="vendor-contact-email">
                Contact email
              </label>
              <input
                id="vendor-contact-email"
                className="field"
                type="email"
                placeholder="orders@vendor.com"
                value={draft.contact_email}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, contact_email: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="label" htmlFor="vendor-notes">
                Notes
              </label>
              <input
                id="vendor-notes"
                className="field"
                placeholder="Notes"
                value={draft.notes}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, notes: e.target.value }))
                }
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              Add
            </button>
          </div>
          {error ? (
            <p style={{ color: "var(--danger)", marginBottom: 0 }}>{error}</p>
          ) : null}
        </form>
      ) : null}

      <div className="table-wrap panel-light">
        <table className="bom-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Account #</th>
              <th>Contact</th>
              <th>Contact email</th>
              <th>Notes</th>
              {canEdit ? <th style={{ width: 160 }}></th> : null}
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => {
              const editing = editingId === v.id;
              return (
                <tr key={v.id}>
                  <td>
                    {editing ? (
                      <input
                        className="field"
                        value={editDraft.code}
                        onChange={(e) =>
                          setEditDraft((d) => ({
                            ...d,
                            code: e.target.value,
                          }))
                        }
                      />
                    ) : (
                      v.code
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <input
                        className="field"
                        value={editDraft.name}
                        onChange={(e) =>
                          setEditDraft((d) => ({
                            ...d,
                            name: e.target.value,
                          }))
                        }
                      />
                    ) : (
                      v.name
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <input
                        className="field"
                        value={editDraft.account_number}
                        onChange={(e) =>
                          setEditDraft((d) => ({
                            ...d,
                            account_number: e.target.value,
                          }))
                        }
                      />
                    ) : (
                      v.account_number || "—"
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
                      v.contact_name || "—"
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <input
                        className="field"
                        type="email"
                        value={editDraft.contact_email}
                        onChange={(e) =>
                          setEditDraft((d) => ({
                            ...d,
                            contact_email: e.target.value,
                          }))
                        }
                      />
                    ) : (
                      v.contact_email || "—"
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <input
                        className="field"
                        value={editDraft.notes}
                        onChange={(e) =>
                          setEditDraft((d) => ({
                            ...d,
                            notes: e.target.value,
                          }))
                        }
                      />
                    ) : (
                      v.notes || "—"
                    )}
                  </td>
                  {canEdit ? (
                    <td>
                      <div className="row" style={{ gap: "0.35rem" }}>
                        {editing ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary"
                              disabled={busy}
                              onClick={() => void saveEdit(v.id)}
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
                            <button
                              type="button"
                              className="btn"
                              disabled={busy}
                              onClick={() => startEdit(v)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn"
                              disabled={busy}
                              onClick={() => void removeVendor(v)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
            {!vendors.length ? (
              <tr>
                <td colSpan={colCount}>No vendors yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
