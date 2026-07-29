import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canEditClientDocuments, canViewFinancials } from "@/lib/auth";
import { requireProjectApiContext } from "@/lib/project-guard";
import { getCompanySettings } from "@/lib/company-settings";
import {
  buildClientDocumentUrl,
  mailConfigured,
  sendClientDocumentEmail,
} from "@/lib/email";
import {
  ensureDocToken,
  getDocForProject,
  writeClientDocEvent,
} from "@/lib/projects/client-documents-server";
import { documentIsSendable } from "@/lib/client-documents";
import { CLIENT_DOCUMENT_TYPE_LABELS } from "@/lib/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id: projectId, docId } = await params;
  const ctx = await requireProjectApiContext(projectId);
  if (ctx instanceof NextResponse) return ctx;
  const profile = ctx.profile;
  if (!canViewFinancials(profile.role) || !ctx.canViewMoney) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!ctx.canEdit(canEditClientDocuments)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const document = await getDocForProject(supabase, projectId, docId);
  if (!document) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (document.archived_at) {
    return NextResponse.json(
      { error: "Archived documents cannot be sent." },
      { status: 400 },
    );
  }
  if (!documentIsSendable(document.status)) {
    return NextResponse.json(
      { error: `A ${document.status} document cannot be sent.` },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => ({}));
  let to = String(body.to ?? "").trim();
  if (!to && document.client_id) {
    const { data: client } = await supabase
      .from("clients")
      .select("email")
      .eq("id", document.client_id)
      .maybeSingle();
    to = String(client?.email ?? "").trim();
  }

  const { token, created } = await ensureDocToken(supabase, docId, profile.id);
  const url = buildClientDocumentUrl(token);
  const now = new Date().toISOString();

  // Keep post-view statuses; otherwise flip to sent.
  const nextStatus = ["viewed", "customer_reviewing"].includes(document.status)
    ? document.status
    : "sent";
  const { data: updated, error } = await supabase
    .from("client_documents")
    .update({ status: nextStatus, sent_at: now, updated_at: now })
    .eq("id", docId)
    .select("*")
    .single();
  if (error || !updated) {
    return NextResponse.json(
      { error: error?.message ?? "Send failed" },
      { status: 400 },
    );
  }

  if (created) {
    await writeClientDocEvent(supabase, {
      documentId: docId,
      eventType: "link_created",
      actorUserId: profile.id,
    });
  }

  let emailed = false;
  let emailError: string | null = null;
  if (to && mailConfigured()) {
    const settings = await getCompanySettings(supabase);
    const result = await sendClientDocumentEmail({
      to,
      documentName: document.name,
      documentTypeLabel:
        CLIENT_DOCUMENT_TYPE_LABELS[document.doc_type] ?? "Document",
      companyName: settings.legal_name,
      message: body.message ? String(body.message) : null,
      documentUrl: url,
      expiresAt: document.expires_at,
    });
    emailed = result.ok;
    if (!result.ok) emailError = result.error;
  }

  await writeClientDocEvent(supabase, {
    documentId: docId,
    eventType: "sent",
    actorUserId: profile.id,
    metadata: { to: to || null, emailed },
  });

  return NextResponse.json({
    document: updated,
    url,
    emailed,
    emailError,
  });
}
