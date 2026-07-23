import { cookies } from "next/headers";

export const LOCAL_SESSION_COOKIE = "mixinary_local_session";

export async function getLocalSessionUserId() {
  const jar = await cookies();
  return jar.get(LOCAL_SESSION_COOKIE)?.value ?? null;
}

export async function setLocalSession(userId: string) {
  const jar = await cookies();
  jar.set(LOCAL_SESSION_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearLocalSession() {
  const jar = await cookies();
  jar.delete(LOCAL_SESSION_COOKIE);
}
