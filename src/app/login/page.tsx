import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { needsSetup } from "@/lib/setup";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await needsSetup()) {
    redirect("/setup");
  }

  return (
    <Suspense
      fallback={
        <div className="login-shell">
          <div className="login-card">Loading…</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
