import type { Metadata } from "next";
import { PublicDocumentView } from "@/components/PublicDocumentView";
import { getCompanySettings } from "@/lib/company-settings";
import { newId } from "@/lib/local/db";
import {
  listDocBlocks,
  resolveDocumentByToken,
} from "@/lib/projects/client-documents-server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { documentIsExpired } from "@/lib/client-documents";
import type { ClientDocumentSignature } from "@/lib/types";

type ServiceClient = Awaited<ReturnType<typeof createClient>>;

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

function ClosedShell({ title, message }: { title: string; message: string }) {
  return (
    <div className="cdoc-public-shell">
      <div className="cdoc-public-frame">
        <div className="cdoc" style={{ padding: "2.5rem" }}>
          <h1 style={{ marginTop: 0 }}>{title}</h1>
          <p style={{ color: "#556b82" }}>{message}</p>
        </div>
      </div>
    </div>
  );
}

export default async function PublicDocumentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createServiceClient() as unknown as ServiceClient;

  const resolution = await resolveDocumentByToken(supabase, token);
  if (!resolution.ok) {
    return (
      <ClosedShell
        title="This link is no longer available"
        message={
          resolution.reason === "revoked"
            ? "Access to this document has been revoked. Please contact the sender for a new link."
            : "This document does not exist or is no longer available. Please contact the sender."
        }
      />
    );
  }

  const document = resolution.document;
  const expired = documentIsExpired(document);

  // Record the view and surface it in the workflow status.
  const now = new Date().toISOString();
  await supabase.from("client_document_events").insert({
    id: newId(),
    document_id: document.id,
    event_type: "viewed",
    actor_user_id: null,
    ip: null,
    user_agent: null,
    metadata: null,
    created_at: now,
  });
  if (document.status === "sent") {
    await supabase
      .from("client_documents")
      .update({ status: "viewed", updated_at: now })
      .eq("id", document.id);
    document.status = "viewed";
  }
  if (expired && !["signed", "accepted", "declined"].includes(document.status)) {
    if (document.status !== "expired") {
      await supabase
        .from("client_documents")
        .update({ status: "expired", updated_at: now })
        .eq("id", document.id);
      document.status = "expired";
    }
  }

  const [blocks, settings, { data: signatures }, { data: client }] =
    await Promise.all([
      listDocBlocks(supabase, document.id),
      getCompanySettings(supabase),
      supabase
        .from("client_document_signatures")
        .select("*")
        .eq("document_id", document.id)
        .order("signed_at"),
      document.client_id
        ? supabase
            .from("clients")
            .select("name")
            .eq("id", document.client_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  return (
    <PublicDocumentView
      token={token}
      initialDocument={document}
      initialBlocks={blocks}
      initialSignatures={(signatures ?? []) as ClientDocumentSignature[]}
      settings={settings}
      clientName={(client as { name?: string } | null)?.name ?? null}
    />
  );
}
