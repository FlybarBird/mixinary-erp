import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { suiteConfig, suiteOidcEnabled } from "@/lib/suite/config";

export const dynamic = "force-dynamic";

export default async function SuiteAdminPage() {
  await requireProfile(["administrator"]);
  const cfg = suiteConfig();

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Suite administration</h1>
        <p className="page-sub">Identity and shared-file settings.</p>
      </div>

      <section className="panel-light" style={{ padding: "1rem" }}>
        <h2 className="section-title">Identity (Authentik OIDC)</h2>
        <p className="page-sub">
          Status: {suiteOidcEnabled() ? "configured" : "not configured"}
        </p>
        <ul className="page-sub">
          <li>Issuer: {cfg.issuer || "—"}</li>
          <li>Client ID: {cfg.clientId || "—"}</li>
          <li>Redirect: {cfg.redirectUri}</li>
        </ul>
        {suiteOidcEnabled() ? (
          <a className="btn btn-secondary" href="/api/auth/oidc/login?next=/admin/suite">
            Test suite login
          </a>
        ) : null}
      </section>

      <section className="panel-light" style={{ padding: "1rem" }}>
        <h2 className="section-title">Shared files</h2>
        <p className="page-sub">Base URL: {cfg.sharedFilesBaseUrl}</p>
        <Link href="/admin/users" className="btn btn-secondary">
          Manage users
        </Link>
      </section>
    </div>
  );
}
