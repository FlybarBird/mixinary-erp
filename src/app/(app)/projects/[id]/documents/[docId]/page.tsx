import { notFound } from "next/navigation";
import { ClientDocumentEditor } from "@/components/ClientDocumentEditor";
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
import {
  getDocForProject,
  listDocBlocks,
} from "@/lib/projects/client-documents-server";
import { createClient } from "@/lib/supabase/server";
import type {
  ClientDocumentEvent,
  ClientDocumentSignature,
  UserProfile,
} from "@/lib/types";

export default async function ClientDocumentEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; docId: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { id, docId } = await params;
  const { preview } = await searchParams;
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
  const document = await getDocForProject(supabase, id, docId);
  if (!document) notFound();

  const [
    blocks,
    settings,
    { data: project },
    { data: users },
    { data: events },
    { data: signatures },
  ] = await Promise.all([
    listDocBlocks(supabase, docId),
    getCompanySettings(supabase),
    supabase
      .from("projects")
      .select("id, name, project_number, clients(name)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("user_profiles")
      .select("id, email, full_name, role")
      .order("full_name"),
    supabase
      .from("client_document_events")
      .select("*")
      .eq("document_id", docId)
      .order("created_at", { ascending: false }),
    supabase
      .from("client_document_signatures")
      .select("*")
      .eq("document_id", docId)
      .order("signed_at"),
  ]);
  if (!project) notFound();

  return (
    <ClientDocumentEditor
      projectId={id}
      initialDocument={document}
      initialBlocks={blocks}
      settings={settings}
      clientName={(project.clients as { name?: string } | null)?.name ?? null}
      users={(users ?? []) as UserProfile[]}
      events={(events ?? []) as ClientDocumentEvent[]}
      signatures={(signatures ?? []) as ClientDocumentSignature[]}
      canEdit={canEditProjectContent(
        profile.role,
        membership.access,
        canEditClientDocuments(profile.role),
      )}
      startInPreview={preview === "1"}
    />
  );
}
