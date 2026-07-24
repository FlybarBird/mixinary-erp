import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { pickLoginTagline } from "@/lib/login-taglines";
import { needsSetup } from "@/lib/setup";

export const dynamic = "force-dynamic";

function LoginFallback() {
  return (
    <div className="login-fallback-shell">
      <div className="login-fallback-card">Loading…</div>
    </div>
  );
}

export default async function LoginPage() {
  if (await needsSetup()) {
    redirect("/setup");
  }

  // Pick on the server so SSR HTML matches the hydrated client tree.
  const tagline = pickLoginTagline();

  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm tagline={tagline} />
    </Suspense>
  );
}
