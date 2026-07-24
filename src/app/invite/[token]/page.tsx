import { notFound } from "next/navigation";
import { AcceptInviteForm } from "@/components/AcceptInviteForm";
import { getLocalDb, isLocalMode } from "@/lib/local/db";

function isExpired(expiresAt: string) {
  return new Date(expiresAt).getTime() < Date.now();
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!isLocalMode()) {
    return (
      <div className="login-shell">
        <div className="login-card stack">
          <h1 className="page-title" style={{ fontSize: "1.25rem" }}>
            Check your email
          </h1>
          <p className="page-sub">
            Supabase invite links open from your invite email. Sign in from{" "}
            <a href="/login">/login</a> after accepting.
          </p>
        </div>
      </div>
    );
  }

  const invite = getLocalDb()
    .prepare(
      `select email, full_name, expires_at, accepted_at from user_invites where token = ?`,
    )
    .get(token) as
    | {
        email: string;
        full_name: string | null;
        expires_at: string;
        accepted_at: string | null;
      }
    | undefined;

  if (!invite || invite.accepted_at) notFound();
  if (isExpired(invite.expires_at)) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <h1 className="page-title" style={{ fontSize: "1.25rem" }}>
            Invite expired
          </h1>
          <p className="page-sub">Ask an administrator to send a new invite.</p>
        </div>
      </div>
    );
  }

  return (
    <AcceptInviteForm
      token={token}
      email={invite.email}
      fullName={invite.full_name}
    />
  );
}
