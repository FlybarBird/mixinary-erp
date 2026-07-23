import { notFound } from "next/navigation";
import { ProjectDashboardView } from "@/components/ProjectDashboardView";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildProjectDashboard } from "@/lib/projects/dashboard";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireProfile();
  const supabase = await createClient();

  const dashboard = await buildProjectDashboard(supabase, id);
  if (!dashboard) notFound();

  return <ProjectDashboardView dashboard={dashboard} />;
}
