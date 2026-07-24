"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { USER_ROLE_LABELS, type UserProfile } from "@/lib/types";

const localMode = process.env.NEXT_PUBLIC_MIXINARY_LOCAL_MODE === "true";

export function AccountForm({
  profile,
  authMethods,
}: {
  profile: UserProfile;
  authMethods: string[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") || "").trim();
    const currentPassword = String(form.get("current_password") || "").trim();
    setLoading(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: form.get("full_name"),
        password: password || null,
        current_password: currentPassword || null,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Update failed");
      return;
    }
    setMessage("Account updated.");
    (e.target as HTMLFormElement).querySelectorAll<HTMLInputElement>(
      'input[type="password"]',
    ).forEach((el) => {
      el.value = "";
    });
    router.refresh();
  }

  return (
    <form className="panel stack" style={{ padding: "1rem", maxWidth: 480 }} onSubmit={onSubmit}>
      <div>
        <label className="label">Email</label>
        <input className="field" value={profile.email} disabled readOnly />
      </div>
      <div>
        <label className="label">Role</label>
        <input
          className="field"
          value={USER_ROLE_LABELS[profile.role]}
          disabled
          readOnly
        />
      </div>
      <div>
        <label className="label">Full name</label>
        <input
          className="field"
          name="full_name"
          defaultValue={profile.full_name ?? ""}
        />
      </div>
      {localMode ? (
        <div>
          <label className="label">Current password</label>
          <input
            className="field"
            name="current_password"
            type="password"
            autoComplete="current-password"
          />
        </div>
      ) : null}
      <div>
        <label className="label">New password</label>
        <input
          className="field"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          placeholder="Leave blank to keep current"
        />
      </div>
      <div>
        <label className="label">Sign-in methods</label>
        <p className="muted" style={{ margin: 0 }}>
          {authMethods.join(", ")}
        </p>
      </div>
      {error ? <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}
      {message ? <p className="muted" style={{ margin: 0 }}>{message}</p> : null}
      <button className="btn btn-primary" type="submit" disabled={loading}>
        {loading ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
