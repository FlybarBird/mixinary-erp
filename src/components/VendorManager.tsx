"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { Vendor } from "@/lib/types";

export function VendorManager({
  initialVendors,
  canEdit,
}: {
  initialVendors: Vendor[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit) return;
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: String(form.get("code") || "").trim(),
        name: String(form.get("name") || "").trim(),
        notes: String(form.get("notes") || "") || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to add vendor");
      return;
    }
    e.currentTarget.reset();
    router.refresh();
  }

  return (
    <div className="stack">
      {canEdit ? (
        <form className="panel" style={{ padding: "1rem" }} onSubmit={onSubmit}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 2fr 2fr auto",
              gap: "0.65rem",
            }}
          >
            <input className="field" name="code" placeholder="Code (SP)" required />
            <input className="field" name="name" placeholder="Name" required />
            <input className="field" name="notes" placeholder="Notes" />
            <button className="btn btn-primary" type="submit">
              Add
            </button>
          </div>
          {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
        </form>
      ) : null}
      <div className="table-wrap panel-light">
        <table className="bom-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {initialVendors.map((v) => (
              <tr key={v.id}>
                <td>{v.code}</td>
                <td>{v.name}</td>
                <td>{v.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
