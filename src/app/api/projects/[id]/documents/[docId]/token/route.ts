import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canEditClientDocuments, canViewFinancials } from "@/lib/auth";
import { requireProjectApiContext } from "@/lib/project-guard";
import { buildClientDocumentUrl } from "@/lib/email";
import {
  ensureDocToken,
  getDocForProject,
  revokeDocTokens,
  writeClientDocEvent,
} from "@/lib/projects/client-documents-server";

async function authorize(projectId: string) {
  const ctx = await requireProjectApiContext(projectId);
  if (ctx instanceof NextResponse) {
    return { error: ctx };
  }
  if (!canViewFinancials(ctx.profile.role) || !ctx.canViewMoney) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (!ctx.canEdit(canEditClientDocuments)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { profile: ctx.profile };
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
