import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, getCurrentProfile } from "@/lib/auth";
import { needsSetup } from "@/lib/setup";
import { getSuiteApps } from "@/lib/suite/apps";
import { suiteOidcEnabled } from "@/lib/suite/config";
import { AppSelector } from "@/components/suite/AppSelector";

export const dynamic = "force-dynamic";

export default async function SuiteLandingPage() {
  if (await needsSetup()) redirect("/setup");
  const user = await getSessionUser();
  const profile = user ? await getCurrentProfile() : null;
  const apps = getSuiteApps().filter((a) => a.id !== "landing");

  return (
    <div className="suite-landing">
      <header className="suite-landing-header">
        <div className="suite-landing-brand">
          <Image src="/brand/mark.png" alt="" width={40} height={40} priority />
          <div>
            <div className="suite-landing-eyebrow">Mixinary Suite</div>
            <h1 className="suite-landing-title">Mixinary</h1>
          </div>
        </div>
        <div className="suite-landing-actions">
          {profile ? (
            <>
              <AppSelector apps={getSuiteApps()} currentId="landing" />
              <span className="suite-landing-user">
                {profile.full_name || profile.email}
              </span>
              <form action="/api/auth/oidc/logout" method="post">
                <button type="submit" className="btn btn-secondary">
                  Sign out
                </button>
              </form>
            </>
          ) : suiteOidcEnabled() ? (
            <a className="btn" href="/api/auth/oidc/login?next=/dashboard">
              Sign in
            </a>
          ) : (
            <Link className="btn" href="/login?next=/dashboard">
              Sign in
            </Link>
          )}
        </div>
      </header>

      <main className="suite-landing-main">
        <p className="suite-landing-lead">
          Enter through one identity. Open ERP, Project Management, Client
          Documents, or Administration.
        </p>
        <div className="suite-app-grid">
          {apps.map((app) =>
            app.external ? (
              <a key={app.id} href={app.href} className="suite-app-card">
                <div className="suite-app-card-title">{app.label}</div>
                <div className="suite-app-card-sub">{app.description}</div>
              </a>
            ) : (
              <Link key={app.id} href={app.href} className="suite-app-card">
                <div className="suite-app-card-title">{app.label}</div>
                <div className="suite-app-card-sub">{app.description}</div>
              </Link>
            ),
          )}
        </div>
      </main>
    </div>
  );
}
