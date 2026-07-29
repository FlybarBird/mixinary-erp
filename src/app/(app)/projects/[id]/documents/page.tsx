import { notFound } from "next/navigation";
import { ClientDocumentsView } from "@/components/ClientDocumentsView";
import {
  canEditClientDocuments,
  canViewFinancials,
  requireProfile,
} from "@/lib/auth";
import { getCompanySettings } from "@/lib/company-settings";
import {
  canEditProjectContent,
  getProjectMembership,
} from "@/lib/project-access";
import { createClient } from "@/lib/supabase/server";
import type {
  ClientDocument,
  ClientDocumentEvent,
  ClientDocumentToken,
  UserProfile,
} from "@/lib/types";

export default async function ClientDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const membership = await getProjectMembership(profile.id, profile.role, id);
  if (!canViewFinancials(profile.role) || !membership.canViewMoney) {
    return (
      <div className="panel" style={{ padding: "1.25rem" }}>
        <strong>Client Documents</strong>
        <p style={{ color: "var(--muted)", marginTop: "0.5rem" }}>
          You do not have permission to view client documents.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const [settings, { data: project }] = await Promise.all([
    getCompanySettings(supabase),
    supabase
      .from("projects")
      .select("id, client_id, clients(name)")
      .eq("id", id)
      .maybeSingle(),
  ]);
  if (!project) notFound();

  if (!settings.client_documents_enabled) {
    return (
      <div className="panel" style={{ padding: "1.25rem" }}>
        <strong>Client Documents</strong>
        <p style={{ color: "var(--muted)", marginTop: "0.5rem" }}>
          The Client Documents add-on is not enabled. An administrator can turn
          it on under Admin → Client Documents.
        </p>
      </div>
    );
  }

  const { data: documents } = await supabase
    .from("client_documents")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  const docs = (documents ?? []) as ClientDocument[];
  const docIds = docs.map((d) => d.id);

  let events: ClientDocumentEvent[] = [];
  let tokens: ClientDocumentToken[] = [];
  if (docIds.length) {
    const [{ data: eventRows }, { data: tokenRows }] = await Promise.all([
      supabase
        .from("client_document_events")
        .select("id, document_id, event_type, actor_user_id, created_at")
        .in("document_id", docIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("client_document_tokens")
        .select("*")
        .in("document_id", docIds)
        .order("created_at", { ascending: false }),
    ]);
    events = (eventRows ?? []) as ClientDocumentEvent[];
    tokens = (tokenRows ?? []) as ClientDocumentToken[];
  }

  const { data: users } = await supabase
    .from("user_profiles")
    .select("id, email, full_name, role")
    .order("full_name");

  return (
    <ClientDocumentsView
      projectId={id}
      clientName={
        (project.clients as { name?: string } | null)?.name ?? null
      }
      initialDocuments={docs}
      initialEvents={events}
      initialTokens={tokens}
      users={(users ?? []) as UserProfile[]}
      canEdit={canEditProjectContent(
        profile.role,
        membership.access,
        canEditClientDocuments(profile.role),
      )}
    />
  );
}
