"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  if (process.env.NEXT_PUBLIC_MIXINARY_LOCAL_MODE === "true") {
    // Browser mutations go through API routes in local mode.
    return {
      auth: {
        async signInWithPassword() {
          return {
            data: { user: null, session: null },
            error: { message: "Use the login form (local mode)." },
          };
        },
        async signOut() {
          await fetch("/api/auth/logout", { method: "POST" });
          return { error: null };
        },
      },
      from() {
        throw new Error(
          "Direct browser DB access is disabled in local mode. Use API routes.",
        );
      },
    } as unknown as ReturnType<typeof createBrowserClient>;
  }

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
