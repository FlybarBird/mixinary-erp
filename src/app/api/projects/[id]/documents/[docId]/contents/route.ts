import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canEditClientDocuments, canViewFinancials } from "@/lib/auth";
import { requireProjectApiContext } from "@/lib/project-guard";
import { newId } from "@/lib/local/db";
import {
  documentIsEditable,
  getDocForProject,
} from "@/lib/projects/client-documents-server";
import {
  CLIENT_DOC_BLOCK_TYPES,
  computeDocumentTotals,
  normalizePricingContent,
  type ClientDocBlockType,
} from "@/lib/client-documents";

/** Full-snapshot autosave of a document's blocks (TemplateEditor pattern). */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id: projectId, docId } = await params;
  const ctx = await requireProjectApiContext(projectId);
  if (ctx instanceof NextResponse) return ctx;
  if (!canViewFinancials(ctx.profile.role) || !ctx.canViewMoney) {
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
  if (!documentIsEditable(document)) {
    return NextResponse.json(
      { error: `Document is ${document.status} and can no longer be edited.` },
      { status: 400 },
    );
  }

  const body = await request.json();
  const rawBlocks = Array.isArray(body.blocks) ? body.blocks : [];

  const now = new Date().toISOString();
  const rows = rawBlocks
    .map((raw: Record<string, unknown>, index: number) => {
      const type = String(raw.block_type ?? "");
      if (!CLIENT_DOC_BLOCK_TYPES.includes(type as ClientDocBlockType)) {
        return null;
      }
      let content =
        raw.content && typeof raw.content === "object"
          ? (raw.content as Record<string, unknown>)
          : {};
      if (type === "pricing") {
        content = normalizePricingContent(content) as unknown as Record<
          string,
          unknown
        >;
      }
      return {
        id: String(raw.id ?? "") || newId(),
        document_id: docId,
        block_type: type,
        sort_order: index,
        hidden: Boolean(raw.hidden),
        content,
        created_at: now,
        updated_at: now,
      };
    })
    .filter((row: unknown): row is NonNullable<typeof row> => row !== null);

  // Replace the full snapshot (block ids are client-stable across saves).
  const { error: deleteError } = await supabase
    .from("client_document_blocks")
    .delete()
    .eq("document_id", docId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }
  if (rows.length) {
    const { error: insertError } = await supabase
      .from("client_document_blocks")
      .insert(rows);
    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 400 },
      );
    }
  }

  const totals = computeDocumentTotals(rows);
  const { data: updated, error } = await supabase
    .from("client_documents")
    .update({
      subtotal: totals.subtotal,
      discount_total: totals.discount_total,
      tax_total: totals.tax_total,
      total: totals.total,
      updated_at: now,
    })
    .eq("id", docId)
    .select("*")
    .single();
  if (error || !updated) {
    return NextResponse.json(
      { error: error?.message ?? "Save failed" },
      { status: 400 },
    );
  }

  return NextResponse.json({ document: updated, blocks: rows, totals });
}
