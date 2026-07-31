export function suiteOidcEnabled() {
  return Boolean(
    process.env.AUTHENTIK_ISSUER?.trim() &&
      process.env.AUTHENTIK_CLIENT_ID?.trim(),
  );
}

export function suiteConfig() {
  const issuer = process.env.AUTHENTIK_ISSUER?.replace(/\/$/, "") || "";
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
  return {
    issuer,
    clientId: process.env.AUTHENTIK_CLIENT_ID || "",
    clientSecret: process.env.AUTHENTIK_CLIENT_SECRET || "",
    authorizeUrl:
      process.env.AUTHENTIK_AUTHORIZE_URL ||
      (issuer ? `${issuer}/authorize/` : ""),
    tokenUrl:
      process.env.AUTHENTIK_TOKEN_URL || (issuer ? `${issuer}/token/` : ""),
    userinfoUrl:
      process.env.AUTHENTIK_USERINFO_URL ||
      (issuer ? `${issuer}/userinfo/` : ""),
    endSessionUrl:
      process.env.AUTHENTIK_END_SESSION_URL ||
      (issuer ? `${issuer}/end-session/` : ""),
    redirectUri:
      process.env.AUTHENTIK_REDIRECT_URI ||
      `${appUrl}/api/auth/oidc/callback`,
    integrationBaseUrl:
      process.env.INTEGRATION_BASE_URL?.replace(/\/$/, "") ||
      "http://127.0.0.1:8091",
    integrationSecret: process.env.INTEGRATION_WEBHOOK_SECRET || "",
    pmBasePath:
      process.env.NEXT_PUBLIC_PM_BASE_PATH?.trim() || "/project-management",
    sharedFilesBaseUrl:
      process.env.NEXT_PUBLIC_SHARED_FILES_URL?.replace(/\/$/, "") ||
      "/shared-files",
  };
}
