"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const localMode = process.env.NEXT_PUBLIC_MIXINARY_LOCAL_MODE === "true";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(localMode ? "admin@mixinary.local" : "");
  const [password, setPassword] = useState(localMode ? "mixinary123" : "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (localMode) {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      setLoading(false);
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      router.push(params.get("next") || "/dashboard");
      router.refresh();
      return;
    }

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.push(params.get("next") || "/dashboard");
    router.refresh();
  }

  return (
    <div className="login-shell">
      <div className="login-card stack">
        <div className="row" style={{ gap: "0.75rem" }}>
          <Image
            src="/brand/mark.png"
            alt="Mixinary"
            width={44}
            height={44}
            priority
          />
          <div>
            <div
              style={{
                fontFamily: "var(--font-display), sans-serif",
                fontWeight: 700,
                fontSize: "1.35rem",
                color: "#032d60",
              }}
            >
              Mixinary ERP
            </div>
            <div className="muted" style={{ fontSize: "0.85rem" }}>
              High Quality Production
            </div>
          </div>
        </div>
        <div>
          <h1 className="page-title" style={{ fontSize: "1.25rem" }}>
            Sign in
          </h1>
          <p className="page-sub">
            {localMode
              ? "Local demo · admin@mixinary.local / mixinary123"
              : "Projects, BOMs, quotes, and procurement."}
          </p>
        </div>
        <form className="stack" onSubmit={onSubmit}>
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="field"
              type="email"
              autoComplete="email"
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
              className="field"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error ? (
            <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>
          ) : null}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
