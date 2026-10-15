import { requireProfile } from "@/lib/auth";
import { AiActivityDock } from "@/components/AiActivityDock";
import { NotificationsDock } from "@/components/NotificationsDock";
import { AppTopNav } from "@/components/AppTopNav";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  return (
    <div className="app-shell">
      <AppTopNav profile={profile} />
      <main className="main">{children}</main>
      <NotificationsDock />
      <AiActivityDock />
    </div>
  );
}
