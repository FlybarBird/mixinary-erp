import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canEditClientDocuments, getCurrentProfile } from "@/lib/auth";
import { buildClientDocumentUrl } from "@/lib/email";
import { canAccessProject } from "@/lib/project-access";
import {
  ensureDocToken,
  getDocForProject,
  revokeDocTokens,
  writeClientDocEvent,
} from "@/lib/projects/client-documents-server";

async function authorize(projectId: string) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!(await canAccessProject(profile.id, profile.role, projectId))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (!canEditClientDocuments(profile.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { profile };
}

/** Create (or reuse) the active secure link for a document. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id: projectId, docId } = await params;
  const auth = await authorize(projectId);
  if ("error" in auth) return auth.error;

  const supabase = await createClient();
  const document = await getDocForProject(supabase, projectId, docId);
  if (!document) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (document.status === "voided" || document.archived_at) {
    return NextResponse.json(
      { error: "Voided or archived documents cannot be shared." },
      { status: 400 },
    );
  }

  const { token, created } = await ensureDocToken(
    supabase,
    docId,
    auth.profile.id,
  );
  if (created) {
    await writeClientDocEvent(supabase, {
      documentId: docId,
      eventType: "link_created",
      actorUserId: auth.profile.id,
    });
  }

  // Sharing a link is equivalent to sending: promote pre-send statuses so the
  // customer view is open for selection and signing (issue #6).
  const PRE_SEND_STATUSES = [
    "draft",
    "internal_review",
    "approved_to_send",
    "changes_requested",
  ];
  if (PRE_SEND_STATUSES.includes(document.status)) {
    const now = new Date().toISOString();
    await supabase
      .from("client_documents")
      .update({
        status: "sent",
        sent_at: document.sent_at ?? now,
        updated_at: now,
      })
      .eq("id", docId);
    await writeClientDocEvent(supabase, {
      documentId: docId,
      eventType: "sent",
      actorUserId: auth.profile.id,
      metadata: { via: "secure_link" },
    });
  }

  return NextResponse.json({ url: buildClientDocumentUrl(token) });
}

/** Revoke all secure links for a document. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id: projectId, docId } = await params;
  const auth = await authorize(projectId);
  if ("error" in auth) return auth.error;

  const supabase = await createClient();
  const document = await getDocForProject(supabase, projectId, docId);
  if (!document) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await revokeDocTokens(supabase, docId);
  await writeClientDocEvent(supabase, {
    documentId: docId,
    eventType: "link_revoked",
    actorUserId: auth.profile.id,
  });
  return NextResponse.json({ ok: true });
}
