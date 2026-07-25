import { canManageClients, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ClientManager } from "@/components/ClientManager";
import type { Client } from "@/lib/types";

export default async function ClientsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const [{ data: clients }, { data: projects }] = await Promise.all([
    supabase.from("clients").select("*").order("name"),
    supabase.from("projects").select("client_id"),
  ]);

  const projectCounts: Record<string, number> = {};
  for (const p of projects ?? []) {
    if (!p.client_id) continue;
    projectCounts[p.client_id] = (projectCounts[p.client_id] ?? 0) + 1;
  }

  const normalized = (clients ?? []).map((c) => ({
    ...c,
    active: c.active !== false && c.active !== 0,
  })) as Client[];

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Clients</h1>
        <p className="page-sub">
          Churches, schools, and other install customers — contacts, addresses,
          and linked projects.
        </p>
      </div>
      <ClientManager
        initialClients={normalized}
        projectCounts={projectCounts}
        canEdit={canManageClients(profile.role)}
      />
    </div>
  );
}
