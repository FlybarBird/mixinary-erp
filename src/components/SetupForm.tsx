"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const localMode = process.env.NEXT_PUBLIC_MIXINARY_LOCAL_MODE === "true";

export function SetupForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/setup", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        full_name: fullName.trim() || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLoading(false);
      setError(data.error || "Setup failed");
      return;
    }

    if (localMode) {
      window.location.assign("/dashboard");
      return;
    }

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (signInError) {
      // Account was created — send them to login if auto sign-in fails
      window.location.assign("/login");
      return;
    }
    window.location.assign("/dashboard");
  }

  return (
    <div className="login-shell">
      <div className="login-card stack">
        <Image
          src="/brand/logo-2.png"
          alt="Mixinary — High Quality Production"
          width={260}
          height={64}
          priority
          style={{ width: "auto", height: "3.25rem", objectFit: "contain" }}
        />
        <div>
          <h1 className="page-title" style={{ fontSize: "1.25rem" }}>
            First-time setup
          </h1>
          <p className="page-sub">
            Create the administrator account for Mixinary ERP. This is only
            available when no users exist yet.
          </p>
        </div>
        <form className="stack" onSubmit={onSubmit}>
          <div>
            <label className="label" htmlFor="full_name">
              Full name
            </label>
            <input
              id="full_name"
              name="name"
              className="field"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <label className="label" htmlFor="email">
              Admin email
            </label>
            <input
              id="email"
              name="username"
              className="field"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              className="field"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="confirm">
              Confirm password
            </label>
            <input
              id="confirm"
              name="confirm"
              className="field"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error ? (
            <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>
          ) : null}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Creating admin…" : "Create admin & continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
