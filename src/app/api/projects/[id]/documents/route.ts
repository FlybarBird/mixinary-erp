import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  canEditClientDocuments,
  canViewFinancials,
  getCurrentProfile,
} from "@/lib/auth";
import { getCompanySettings } from "@/lib/company-settings";
import { newId } from "@/lib/local/db";
import { canAccessProject } from "@/lib/project-access";
import { allocateNextClientDocNumber } from "@/lib/projects/numbering";
import {
  listDocBlocks,
  starterBlocks,
  writeClientDocEvent,
} from "@/lib/projects/client-documents-server";
import {
  CLIENT_DOCUMENT_TYPE_LABELS,
  type ClientDocument,
  type ClientDocumentType,
} from "@/lib/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
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
  const { data, error } = await supabase
    .from("client_documents")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ documents: data ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
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
  const settings = await getCompanySettings(supabase);
  if (!settings.client_documents_enabled) {
    return NextResponse.json(
      { error: "The Client Documents add-on is not enabled." },
      { status: 403 },
    );
  }

  const body = await request.json();
  const now = new Date().toISOString();

  // Duplicate or new-version path
  const sourceId = String(body.duplicate_of || body.new_version_of || "");
  if (sourceId) {
    const asNewVersion = Boolean(body.new_version_of);
    const { data: source } = await supabase
      .from("client_documents")
      .select("*")
      .eq("id", sourceId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (!source) {
      return NextResponse.json(
        { error: "Source document not found" },
        { status: 404 },
      );
    }
    const src = source as ClientDocument;
    const docNumber = await allocateNextClientDocNumber(
      supabase,
      projectId,
      src.doc_type,
    );
    const row = {
      id: newId(),
      project_id: projectId,
      client_id: src.client_id,
      doc_type: src.doc_type,
      name: asNewVersion ? src.name : `${src.name} (copy)`,
      doc_number: docNumber,
      status: "draft",
      version: asNewVersion ? Number(src.version ?? 1) + 1 : 1,
      parent_document_id: asNewVersion ? src.id : null,
      expires_at: src.expires_at,
      sent_at: null,
      subtotal: src.subtotal,
      discount_total: src.discount_total,
      tax_total: src.tax_total,
      total: src.total,
      amount_paid: 0,
      assigned_to: src.assigned_to,
      settings: src.settings,
      created_by: profile.id,
      archived_at: null,
      created_at: now,
      updated_at: now,
    };
    const { data: created, error } = await supabase
      .from("client_documents")
      .insert(row)
      .select("*")
      .single();
    if (error || !created) {
      return NextResponse.json(
        { error: error?.message ?? "Create failed" },
        { status: 400 },
      );
    }

    const blocks = await listDocBlocks(supabase, src.id);
    if (blocks.length) {
      await supabase.from("client_document_blocks").insert(
        blocks.map((b) => ({
          id: newId(),
          document_id: row.id,
          block_type: b.block_type,
          sort_order: b.sort_order,
          hidden: b.hidden,
          content: b.content,
          created_at: now,
          updated_at: now,
        })),
      );
    }

    if (asNewVersion) {
      await supabase
        .from("client_documents")
        .update({ status: "superseded", updated_at: now })
        .eq("id", src.id);
      await writeClientDocEvent(supabase, {
        documentId: src.id,
        eventType: "superseded",
        actorUserId: profile.id,
        metadata: { new_document_id: row.id },
      });
    }
    await writeClientDocEvent(supabase, {
      documentId: row.id,
      eventType: "created",
      actorUserId: profile.id,
      metadata: asNewVersion
        ? { new_version_of: src.id }
        : { duplicate_of: src.id },
    });
    return NextResponse.json({ document: created });
  }

  // Fresh document
  const docType = String(body.doc_type || "proposal_quote") as ClientDocumentType;
  if (!["proposal", "quote", "proposal_quote"].includes(docType)) {
    return NextResponse.json(
      { error: "Only proposal and quote documents are supported right now." },
      { status: 400 },
    );
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, client_id, clients(name)")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const docNumber = await allocateNextClientDocNumber(
    supabase,
    projectId,
    docType,
  );
  const name =
    String(body.name ?? "").trim() ||
    `${CLIENT_DOCUMENT_TYPE_LABELS[docType]} ${docNumber}`;

  const row = {
    id: newId(),
    project_id: projectId,
    client_id: (project.client_id as string | null) ?? null,
    doc_type: docType,
    name,
    doc_number: docNumber,
    status: "draft",
    version: 1,
    parent_document_id: null,
    expires_at: null,
    sent_at: null,
    subtotal: 0,
    discount_total: 0,
    tax_total: 0,
    total: 0,
    amount_paid: 0,
    assigned_to: profile.id,
    settings: null,
    created_by: profile.id,
    archived_at: null,
    created_at: now,
    updated_at: now,
  };

  const { data: created, error } = await supabase
    .from("client_documents")
    .insert(row)
    .select("*")
    .single();
  if (error || !created) {
    return NextResponse.json(
      { error: error?.message ?? "Create failed" },
      { status: 400 },
    );
  }

  const blocks = starterBlocks(row.id, settings, {
    projectName: String(project.name ?? ""),
    clientName: (project.clients as { name?: string } | null)?.name ?? null,
  });
  await supabase.from("client_document_blocks").insert(
    blocks.map((b) => ({ ...b })),
  );

  await writeClientDocEvent(supabase, {
    documentId: row.id,
    eventType: "created",
    actorUserId: profile.id,
  });

  return NextResponse.json({ document: created });
}
