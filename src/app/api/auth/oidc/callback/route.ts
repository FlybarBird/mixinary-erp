import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { suiteConfig } from "@/lib/suite/config";
import { isLocalMode, getLocalDb, newId } from "@/lib/local/db";
import { LOCAL_SESSION_COOKIE } from "@/lib/local/session";
import { publishIntegrationEvent } from "@/lib/integration/client";
import { createClient } from "@/lib/supabase/server";

type UserInfo = {
  sub: string;
  email?: string;
  preferred_username?: string;
  name?: string;
};

async function exchangeCode(code: string, verifier: string) {
  const cfg = suiteConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
    client_id: cfg.clientId,
    code_verifier: verifier,
  });
  if (cfg.clientSecret) body.set("client_secret", cfg.clientSecret);

  const tokenRes = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenRes.ok) {
    throw new Error(`token exchange failed: ${tokenRes.status}`);
  }
  const tokens = (await tokenRes.json()) as { access_token: string };
  const infoRes = await fetch(cfg.userinfoUrl, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  if (!infoRes.ok) {
    throw new Error(`userinfo failed: ${infoRes.status}`);
  }
  return (await infoRes.json()) as UserInfo;
}

async function upsertLocalUser(info: UserInfo) {
  const email = (info.email || info.preferred_username || "").toLowerCase();
  if (!email) throw new Error("OIDC userinfo missing email");
  const db = getLocalDb();
  const existing = db
    .prepare("select id, email, full_name, role from user_profiles where lower(email)=?")
    .get(email) as
    | { id: string; email: string; full_name: string | null; role: string }
    | undefined;

  if (existing) {
    try {
      db.prepare(
        `update user_profiles set idp_subject=?, full_name=coalesce(?, full_name) where id=?`,
      ).run(info.sub, info.name ?? null, existing.id);
    } catch {
      // column may not exist yet on very old DBs — migrate() adds it
    }
    return existing;
  }

  const id = newId();
  db.prepare(
    `insert into user_profiles (id, email, full_name, role, idp_subject, active)
     values (?, ?, ?, 'project_manager', ?, 1)`,
  ).run(id, email, info.name ?? null, info.sub);
  return { id, email, full_name: info.name ?? null, role: "project_manager" };
}

async function upsertCloudUser(info: UserInfo) {
  const email = (info.email || "").toLowerCase();
  if (!email) throw new Error("OIDC userinfo missing email");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) throw new Error("Supabase admin env missing");

  const admin = createSupabaseAdmin(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id, email, full_name, role")
    .eq("email", email)
    .maybeSingle();

  if (profile) {
    await supabase
      .from("user_profiles")
      .update({ idp_subject: info.sub, full_name: info.name || profile.full_name })
      .eq("id", profile.id);
    return profile;
  }

  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: info.name, idp_subject: info.sub },
  });
  if (created.error || !created.data.user) {
    throw new Error(created.error?.message || "Failed to create auth user");
  }
  await admin.from("user_profiles").upsert({
    id: created.data.user.id,
    email,
    full_name: info.name ?? null,
    role: "project_manager",
    idp_subject: info.sub,
    active: true,
  });
  return {
    id: created.data.user.id,
    email,
    full_name: info.name ?? null,
    role: "project_manager",
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expectedState = jar.get("mixinary_oidc_state")?.value;
  const verifier = jar.get("mixinary_oidc_verifier")?.value;
  const next = jar.get("mixinary_oidc_next")?.value || "/dashboard";

  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    return NextResponse.redirect(new URL("/login?error=oidc_state", url.origin));
  }

  try {
    const info = await exchangeCode(code, verifier);
    const profile = isLocalMode()
      ? await upsertLocalUser(info)
      : await upsertCloudUser(info);

    await publishIntegrationEvent({
      eventType: "user.provision",
      idempotencyKey: `user.provision:${profile.id}:${info.sub}`,
      data: {
        erpUserId: profile.id,
        idpSubject: info.sub,
        verifiedEmail: profile.email,
        planeRole: profile.role === "administrator" ? "admin" : "member",
        planeAccessStatus: "enabled",
      },
    });

    if (isLocalMode()) {
      const res = NextResponse.redirect(new URL(next, url.origin));
      res.cookies.set(LOCAL_SESSION_COOKIE, profile.id, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
      clearOidcCookies(res);
      return res;
    }

    // Cloud: one-time magic link to establish Supabase session without password sharing.
    const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const admin = createSupabaseAdmin(serviceUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const link = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: profile.email,
      options: {
        redirectTo: `${url.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    const action =
      link.data.properties?.action_link ||
      `${url.origin}/login?error=oidc_session`;
    const res = NextResponse.redirect(action);
    clearOidcCookies(res);
    return res;
  } catch (err) {
    console.error("OIDC callback failed", err);
    return NextResponse.redirect(new URL("/login?error=oidc_failed", url.origin));
  }
}

function clearOidcCookies(res: NextResponse) {
  for (const name of [
    "mixinary_oidc_verifier",
    "mixinary_oidc_state",
    "mixinary_oidc_next",
  ]) {
    res.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
}
