import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { mailConfigured, sendNotificationEmail } from "@/lib/email";
import {
  requestIp,
  resolveDocumentByToken,
  writeClientDocEvent,
} from "@/lib/projects/client-documents-server";
import { documentIsOpenForCustomer } from "@/lib/client-documents";

type ServiceClient = Awaited<ReturnType<typeof createClient>>;

/** Customer declines the document (optionally with requested changes). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const supabase = createServiceClient() as unknown as ServiceClient;
  const resolution = await resolveDocumentByToken(supabase, token);
  if (!resolution.ok) {
    return NextResponse.json({ error: "Link unavailable" }, { status: 404 });
  }
  const document = resolution.document;
  if (!documentIsOpenForCustomer(document.status)) {
    return NextResponse.json(
      { error: "This document is no longer open for a response." },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const comment = String(body.comment ?? "").trim();
  const now = new Date().toISOString();

  // A decline with a comment is a change request; a plain decline is final.
  const nextStatus = comment ? "changes_requested" : "declined";
  const { data: updatedDoc, error } = await supabase
    .from("client_documents")
    .update({ status: nextStatus, updated_at: now })
    .eq("id", document.id)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeClientDocEvent(supabase, {
    documentId: document.id,
    eventType: "declined",
    actorUserId: null,
    ip: requestIp(request),
    userAgent: request.headers.get("user-agent"),
    metadata: { comment: comment || null, status: nextStatus },
  });

  if (mailConfigured() && document.assigned_to) {
    const { data: assignee } = await supabase
      .from("user_profiles")
      .select("email")
      .eq("id", document.assigned_to)
      .maybeSingle();
    if (assignee?.email) {
      await sendNotificationEmail({
        to: String(assignee.email),
        title: `${comment ? "Changes requested" : "Declined"}: ${document.name}`,
        message: comment
          ? `The customer requested changes on "${document.name}" (${document.doc_number}): ${comment}`
          : `The customer declined "${document.name}" (${document.doc_number}).`,
      });
    }
  }

  return NextResponse.json({ document: updatedDoc });
}
