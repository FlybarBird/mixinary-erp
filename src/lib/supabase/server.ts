import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { isLocalMode } from "@/lib/local/db";
import { createLocalClient } from "@/lib/local/query";
import { getLocalSessionUserId } from "@/lib/local/session";
import { getBearerAccessToken } from "@/lib/supabase/request-auth";

export async function createClient() {
  if (isLocalMode()) {
    // Native / API clients may send Bearer <userId> in local mode.
    const bearer = await getBearerAccessToken();
    const userId = bearer ?? (await getLocalSessionUserId());
    return createLocalClient(userId) as unknown as Awaited<
      ReturnType<typeof createSupabaseServer>
    >;
  }

  const bearer = await getBearerAccessToken();
  if (bearer) {
    return createSupabaseBearerClient(bearer);
  }
  return createSupabaseServer();
}

/** User-scoped Supabase client for native apps (JWT access token). */
function createSupabaseBearerClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase configuration");
  }
  return createSupabaseClient(url, key, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function createSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — middleware will refresh sessions.
          }
        },
      },
    },
  );
}

export function createServiceClient() {
  if (isLocalMode()) {
    return createLocalClient(null) as unknown as ReturnType<
      typeof createSupabaseClient
    >;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase service role configuration");
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
