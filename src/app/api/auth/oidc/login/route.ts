import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { suiteConfig, suiteOidcEnabled } from "@/lib/suite/config";

function b64url(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function GET(request: Request) {
  if (!suiteOidcEnabled()) {
    return NextResponse.json(
      { error: "OIDC is not configured (set AUTHENTIK_ISSUER and AUTHENTIK_CLIENT_ID)" },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const next = url.searchParams.get("next") || "/apps";
  const cfg = suiteConfig();

  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(16));

  const authorize = new URL(cfg.authorizeUrl);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", cfg.clientId);
  authorize.searchParams.set("redirect_uri", cfg.redirectUri);
  authorize.searchParams.set("scope", "openid email profile");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");

  const res = NextResponse.redirect(authorize.toString());
  res.cookies.set("mixinary_oidc_verifier", verifier, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  res.cookies.set("mixinary_oidc_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  res.cookies.set("mixinary_oidc_next", next, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
