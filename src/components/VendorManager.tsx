"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Vendor } from "@/lib/types";

type Draft = {
  code: string;
  name: string;
  account_number: string;
  notes: string;
};

const emptyDraft = (): Draft => ({
  code: "",
  name: "",
  account_number: "",
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

  return (
    <div className="stack">
      {canEdit ? (
        <form className="panel" style={{ padding: "1rem" }} onSubmit={onCreate}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1.4fr 1.2fr 1.4fr auto",
              gap: "0.65rem",
            }}
          >
            <input
              className="field"
              placeholder="Code (SP)"
              required
              value={draft.code}
              onChange={(e) =>
                setDraft((d) => ({ ...d, code: e.target.value }))
              }
            />
            <input
              className="field"
              placeholder="Name"
              required
              value={draft.name}
              onChange={(e) =>
                setDraft((d) => ({ ...d, name: e.target.value }))
              }
            />
            <input
              className="field"
              placeholder="Account #"
              value={draft.account_number}
              onChange={(e) =>
                setDraft((d) => ({ ...d, account_number: e.target.value }))
              }
            />
            <input
              className="field"
              placeholder="Notes"
              value={draft.notes}
              onChange={(e) =>
                setDraft((d) => ({ ...d, notes: e.target.value }))
              }
            />
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
                <td colSpan={canEdit ? 5 : 4}>No vendors yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
