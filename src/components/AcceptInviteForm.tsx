"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";

export function AcceptInviteForm({
  token,
  email,
  fullName,
}: {
  token: string;
  email: string;
  fullName: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") || "");
    const confirm = String(form.get("confirm") || "");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/invite/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        password,
        full_name: form.get("full_name"),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setLoading(false);
      setError(data.error || "Could not accept invite");
      return;
    }
    window.location.assign("/dashboard");
  }

  return (
    <div className="login-shell">
      <div className="login-card stack">
        <Image
          src="/brand/logo-2.png"
          alt="Mixinary"
          width={260}
          height={64}
          priority
          style={{ width: "auto", height: "3.25rem", objectFit: "contain" }}
        />
        <div>
          <h1 className="page-title" style={{ fontSize: "1.25rem" }}>
            Accept invitation
          </h1>
          <p className="page-sub">Create your password for {email}.</p>
        </div>
        <form className="stack" onSubmit={onSubmit}>
          <div>
            <label className="label">Full name</label>
            <input
              className="field"
              name="full_name"
              defaultValue={fullName ?? ""}
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="field"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="label">Confirm password</label>
            <input
              className="field"
              name="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          {error ? (
            <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>
          ) : null}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Creating…" : "Join Mixinary ERP"}
          </button>
        </form>
      </div>
    </div>
  );
}
