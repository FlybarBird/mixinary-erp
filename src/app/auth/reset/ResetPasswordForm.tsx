"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage("Password updated. You can continue to the app.");
  }

  return (
    <div className="login-shell">
      <div className="login-card stack">
        <h1 className="page-title" style={{ fontSize: "1.25rem" }}>
          Set a new password
        </h1>
        <form className="stack" onSubmit={onSubmit}>
          <div>
            <label className="label" htmlFor="password">
              New password
            </label>
            <input
              id="password"
              className="field"
              type="password"
              autoComplete="new-password"
              required
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
              className="field"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error ? (
            <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>
          ) : null}
          {message ? <p className="muted" style={{ margin: 0 }}>{message}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Saving…" : "Update password"}
          </button>
          <a className="btn" href="/dashboard">
            Go to dashboard
          </a>
        </form>
      </div>
    </div>
  );
}
