import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCompanySettings } from "@/lib/company-settings";
import { mailConfigured, sendNotificationEmail } from "@/lib/email";
import { newId } from "@/lib/local/db";
import {
  requestIp,
  resolveDocumentByToken,
  writeClientDocEvent,
} from "@/lib/projects/client-documents-server";
import {
  documentIsExpired,
  documentIsOpenForCustomer,
} from "@/lib/client-documents";

type ServiceClient = Awaited<ReturnType<typeof createClient>>;

/** Customer accepts and e-signs the document. */
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
  if (documentIsExpired(document)) {
    return NextResponse.json(
      { error: "This document has expired and can no longer be signed." },
      { status: 400 },
    );
  }
  if (!documentIsOpenForCustomer(document.status)) {
    return NextResponse.json(
      { error: "This document is no longer open for signature." },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const signerName = String(body.signer_name ?? "").trim();
  const signerEmail = String(body.signer_email ?? "").trim() || null;
  const signatureText =
    String(body.signature_text ?? "").trim() || signerName;
  if (!signerName || !signatureText) {
    return NextResponse.json(
      { error: "Name and signature are required." },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const ip = requestIp(request);
  const userAgent = request.headers.get("user-agent");

  const signatureRow = {
    id: newId(),
    document_id: document.id,
    signer_name: signerName,
    signer_email: signerEmail,
    signature_text: signatureText,
    signed_at: now,
    ip,
    user_agent: userAgent,
  };
  const { data: signature, error: sigError } = await supabase
    .from("client_document_signatures")
    .insert(signatureRow)
    .select("*")
    .single();
  if (sigError) {
    return NextResponse.json({ error: sigError.message }, { status: 400 });
  }

  const { data: updatedDoc, error } = await supabase
    .from("client_documents")
    .update({ status: "signed", updated_at: now })
    .eq("id", document.id)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeClientDocEvent(supabase, {
    documentId: document.id,
    eventType: "signed",
    actorUserId: null,
    ip,
    userAgent,
    metadata: { signer_name: signerName, signer_email: signerEmail },
  });

  // Notify the assigned staff member (best effort).
  if (mailConfigured() && document.assigned_to) {
    const { data: assignee } = await supabase
      .from("user_profiles")
      .select("email")
      .eq("id", document.assigned_to)
      .maybeSingle();
    const settings = await getCompanySettings(supabase);
    if (assignee?.email) {
      await sendNotificationEmail({
        to: String(assignee.email),
        title: `Signed: ${document.name}`,
        message: `${signerName} accepted and signed "${document.name}" (${document.doc_number})${
          settings.legal_name ? ` for ${settings.legal_name}` : ""
        }.`,
      });
    }
  }

  return NextResponse.json({ document: updatedDoc, signature });
}
