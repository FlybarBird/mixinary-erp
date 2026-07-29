import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  listDocBlocks,
  requestIp,
  resolveDocumentByToken,
  writeClientDocEvent,
} from "@/lib/projects/client-documents-server";
import {
  applyCustomerSelections,
  computeDocumentTotals,
  documentIsExpired,
  documentIsOpenForCustomer,
  type DocBlockSnapshot,
} from "@/lib/client-documents";

type ServiceClient = Awaited<ReturnType<typeof createClient>>;

/** Customer toggles an optional line or adjusts an editable quantity. */
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
  if (documentIsExpired(document) || !documentIsOpenForCustomer(document.status)) {
    return NextResponse.json(
      { error: "This document can no longer be changed." },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const blockId = String(body.block_id ?? "");
  const lineId = String(body.line_id ?? "");
  if (!blockId || !lineId) {
    return NextResponse.json({ error: "Invalid selection" }, { status: 400 });
  }

  const blocks = await listDocBlocks(supabase, document.id);
  const snapshots: DocBlockSnapshot[] = blocks.map((b) => ({
    id: b.id,
    block_type: b.block_type,
    sort_order: b.sort_order,
    hidden: b.hidden,
    content: b.content ?? {},
  }));

  const updated = applyCustomerSelections(snapshots, [
    {
      block_id: blockId,
      line_id: lineId,
      selected: typeof body.selected === "boolean" ? body.selected : undefined,
      qty: typeof body.qty === "number" ? body.qty : undefined,
    },
  ]);

  const changed = updated.find(
    (b, i) => b.content !== snapshots[i]!.content && b.id === blockId,
  );
  const now = new Date().toISOString();
  if (changed) {
    await supabase
      .from("client_document_blocks")
      .update({ content: changed.content, updated_at: now })
      .eq("id", changed.id);
  }

  const totals = computeDocumentTotals(updated);
  const nextStatus = ["sent", "viewed"].includes(document.status)
    ? "customer_reviewing"
    : document.status;
  const { data: updatedDoc } = await supabase
    .from("client_documents")
    .update({
      subtotal: totals.subtotal,
      discount_total: totals.discount_total,
      tax_total: totals.tax_total,
      total: totals.total,
      status: nextStatus,
      updated_at: now,
    })
    .eq("id", document.id)
    .select("*")
    .single();

  await writeClientDocEvent(supabase, {
    documentId: document.id,
    eventType: "option_changed",
    actorUserId: null,
    ip: requestIp(request),
    userAgent: request.headers.get("user-agent"),
    metadata: {
      block_id: blockId,
      line_id: lineId,
      selected: body.selected ?? null,
      qty: body.qty ?? null,
    },
  });

  const freshBlocks = await listDocBlocks(supabase, document.id);
  return NextResponse.json({
    document: updatedDoc,
    blocks: freshBlocks,
    totals,
  });
}
