import { notFound } from "next/navigation";
import { canManageClients, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ClientDetailView } from "@/components/ClientDetailView";
import type { Client, ProjectStatus } from "@/lib/types";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!client) notFound();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, project_number, name, status, project_manager_id")
    .eq("client_id", id)
    .order("project_number", { ascending: false });

  const managerIds = [
    ...new Set(
      (projects ?? [])
        .map((p) => p.project_manager_id)
        .filter(Boolean) as string[],
    ),
  ];
  const managerNames = new Map<string, string>();
  if (managerIds.length) {
    const { data: managers } = await supabase
      .from("user_profiles")
      .select("id, full_name, email")
      .in("id", managerIds);
    for (const m of managers ?? []) {
      managerNames.set(m.id, m.full_name || m.email || "—");
    }
  }

  const normalized: Client = {
    ...(client as Client),
    active: client.active !== false && client.active !== 0,
  };

  return (
    <ClientDetailView
      initialClient={normalized}
      canEdit={canManageClients(profile.role)}
      projects={(projects ?? []).map((p) => ({
        id: p.id,
        project_number: p.project_number,
        name: p.name,
        status: p.status as ProjectStatus,
        project_manager_name: p.project_manager_id
          ? managerNames.get(p.project_manager_id) ?? null
          : null,
      }))}
    />
  );
}
