"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { Client } from "@/lib/types";

export function ClientManager({
  initialClients,
  canEdit,
}: {
  initialClients: Client[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit) return;
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name") || "").trim(),
        contact_name: String(form.get("contact_name") || "") || null,
        email: String(form.get("email") || "") || null,
        phone: String(form.get("phone") || "") || null,
        notes: String(form.get("notes") || "") || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to add client");
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
              gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
              gap: "0.65rem",
            }}
          >
            <input className="field" name="name" placeholder="Client name" required />
            <input className="field" name="contact_name" placeholder="Contact" />
            <input className="field" name="email" placeholder="Email" />
            <input className="field" name="phone" placeholder="Phone" />
            <input className="field" name="notes" placeholder="Notes" />
          </div>
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <button className="btn btn-primary" type="submit">
              Add client
            </button>
            {error ? <span style={{ color: "var(--danger)" }}>{error}</span> : null}
          </div>
        </form>
      ) : null}

      <div className="table-wrap panel-light">
        <table className="bom-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {initialClients.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.contact_name}</td>
                <td>{c.email}</td>
                <td>{c.phone}</td>
                <td>{c.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
