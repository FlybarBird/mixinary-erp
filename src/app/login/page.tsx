import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
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
