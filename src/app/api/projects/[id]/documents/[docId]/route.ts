import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  canEditClientDocuments,
  canViewFinancials,
  getCurrentProfile,
} from "@/lib/auth";
import { canAccessProject } from "@/lib/project-access";
import {
  getActiveDocToken,
  getDocForProject,
  listDocBlocks,
  revokeDocTokens,
  writeClientDocEvent,
} from "@/lib/projects/client-documents-server";

/** Staff-settable statuses (customer outcomes come from the public routes). */
const STAFF_STATUSES = [
  "draft",
  "internal_review",
  "approved_to_send",
  "voided",
] as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id: projectId, docId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await canAccessProject(profile.id, profile.role, projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!canViewFinancials(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const document = await getDocForProject(supabase, projectId, docId);
  if (!document) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [blocks, token, { data: events }, { data: signatures }] =
    await Promise.all([
      listDocBlocks(supabase, docId),
      getActiveDocToken(supabase, docId),
      supabase
        .from("client_document_events")
        .select("*")
        .eq("document_id", docId)
        .order("created_at", { ascending: false }),
      supabase
        .from("client_document_signatures")
        .select("*")
        .eq("document_id", docId)
        .order("signed_at", { ascending: false }),
    ]);

  return NextResponse.json({
    document,
    blocks,
    hasActiveLink: Boolean(token),
    events: events ?? [],
    signatures: signatures ?? [],
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id: projectId, docId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await canAccessProject(profile.id, profile.role, projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!canEditClientDocuments(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const document = await getDocForProject(supabase, projectId, docId);
  if (!document) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    patch.name = name;
  }
  if (body.expires_at !== undefined) {
    patch.expires_at = body.expires_at ? String(body.expires_at) : null;
  }
  if (body.assigned_to !== undefined) {
    patch.assigned_to = body.assigned_to ? String(body.assigned_to) : null;
  }
  if (body.settings !== undefined) {
    patch.settings =
      body.settings && typeof body.settings === "object" ? body.settings : null;
  }
  if (body.archived !== undefined) {
    patch.archived_at = body.archived ? new Date().toISOString() : null;
  }

  let statusEvent: string | null = null;
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!STAFF_STATUSES.includes(status as (typeof STAFF_STATUSES)[number])) {
      return NextResponse.json(
        { error: `Status "${status}" cannot be set manually.` },
        { status: 400 },
      );
    }
    if (
      ["signed", "accepted", "declined"].includes(document.status) &&
      status !== "voided"
    ) {
      return NextResponse.json(
        { error: "Completed documents can only be voided." },
        { status: 400 },
      );
    }
    patch.status = status;
    statusEvent = status === "voided" ? "voided" : "updated";
  }

  const { data: updated, error } = await supabase
    .from("client_documents")
    .update(patch)
    .eq("id", docId)
    .select("*")
    .single();
  if (error || !updated) {
    return NextResponse.json(
      { error: error?.message ?? "Update failed" },
      { status: 400 },
    );
  }

  if (patch.status === "voided") {
    await revokeDocTokens(supabase, docId);
  }
  if (statusEvent) {
    await writeClientDocEvent(supabase, {
      documentId: docId,
      eventType: statusEvent,
      actorUserId: profile.id,
      metadata:
        statusEvent === "updated" ? { status: patch.status } : null,
    });
  }
  if (body.archived !== undefined) {
    await writeClientDocEvent(supabase, {
      documentId: docId,
      eventType: body.archived ? "archived" : "updated",
      actorUserId: profile.id,
      metadata: body.archived ? null : { unarchived: true },
    });
  }

  return NextResponse.json({ document: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id: projectId, docId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await canAccessProject(profile.id, profile.role, projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!canEditClientDocuments(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const document = await getDocForProject(supabase, projectId, docId);
  if (!document) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (document.status !== "draft") {
    return NextResponse.json(
      { error: "Only draft documents can be deleted. Void it instead." },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("client_documents")
    .delete()
    .eq("id", docId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
