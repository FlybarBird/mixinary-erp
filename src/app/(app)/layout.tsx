import { requireProfile } from "@/lib/auth";
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
    </div>
  );
}
