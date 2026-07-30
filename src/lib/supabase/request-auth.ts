import { headers } from "next/headers";

/** Extract `Authorization: Bearer <token>` from the incoming request, if present. */
export async function getBearerAccessToken(): Promise<string | null> {
  try {
    const headerStore = await headers();
    const auth = headerStore.get("authorization");
    if (!auth) return null;
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    const token = match?.[1]?.trim();
    return token || null;
  } catch {
    // headers() unavailable outside a request context
    return null;
  }
}
