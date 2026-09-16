import { requireProfile } from "@/lib/auth";
import { AiActivityDock } from "@/components/AiActivityDock";
import { NotificationsDock } from "@/components/NotificationsDock";
import { AppTopNav } from "@/components/AppTopNav";
import { getSuiteApps } from "@/lib/suite/apps";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  const suiteApps = getSuiteApps();

  return (
    <div className="app-shell">
      <AppTopNav profile={profile} suiteApps={suiteApps} />
      <main className="main">{children}</main>
      <NotificationsDock />
      <AiActivityDock />
    </div>
  );
}
