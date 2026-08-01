import Link from "next/link";
import { requireProfile } from "@/lib/auth";

const adminApps = [
  {
    href: "/admin/ai-settings",
    title: "AI Settings",
    sub: "OpenAI API key for scrape & review",
    icon: "AI",
  },
  {
    href: "/admin/email",
    title: "Email",
    sub: "Resend / SMTP status and test send",
    icon: "MAIL",
  },
  {
    href: "/admin/price-sources",
    title: "Price Sources",
    sub: "Allowlisted MSRP domains",
    icon: "SRC",
  },
  {
    href: "/admin/import",
    title: "Import",
    sub: "Workbook / project import",
    icon: "IMP",
  },
  {
    href: "/admin/users",
    title: "Users",
    sub: "Roles and access",
    icon: "USR",
  },
  {
    href: "/admin/client-documents",
    title: "Client Documents",
    sub: "Add-on toggle, branding, document defaults",
    icon: "DOC",
  },
  {
    href: "/admin/label-printing",
    title: "Label printing",
    sub: "DYMO vs Brother QL for warehouse QR labels",
    icon: "LBL",
  },
  {
    href: "/admin/suite",
    title: "Suite",
    sub: "OIDC, Project Management access, integrations",
    icon: "SUITE",
  },
] as const;

export default async function AdminHomePage() {
  await requireProfile(["administrator"]);

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Admin</h1>
        <p className="page-sub">System settings for Mixinary ERP.</p>
      </div>
      <div className="app-tile-grid">
        {adminApps.map((app) => (
          <Link key={app.href} href={app.href} className="app-tile">
            <span className="app-tile-icon">{app.icon}</span>
            <div>
              <div className="app-tile-title">{app.title}</div>
              <div className="app-tile-sub">{app.sub}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
