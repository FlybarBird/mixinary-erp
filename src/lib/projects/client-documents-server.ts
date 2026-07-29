import { randomBytes } from "node:crypto";
import { newId } from "@/lib/local/db";
import { createClient } from "@/lib/supabase/server";
import {
  defaultBlockContent,
  type ClientDocBlockType,
} from "@/lib/client-documents";
import type {
  ClientDocument,
  ClientDocumentBlock,
  CompanySettings,
} from "@/lib/types";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Editable statuses — content can change until customer/final outcomes. */
export function documentIsEditable(doc: {
  status: string;
  archived_at: string | null;
}): boolean {
  if (doc.archived_at) return false;
  return [
    "draft",
    "internal_review",
    "approved_to_send",
    "sent",
    "viewed",
    "customer_reviewing",
    "changes_requested",
  ].includes(doc.status);
}

export async function getDocForProject(
  supabase: Client,
  projectId: string,
  docId: string,
): Promise<ClientDocument | null> {
  const { data } = await supabase
    .from("client_documents")
    .select("*")
    .eq("id", docId)
    .eq("project_id", projectId)
    .maybeSingle();
  return (data as ClientDocument | null) ?? null;
}

export async function listDocBlocks(
  supabase: Client,
  documentId: string,
): Promise<ClientDocumentBlock[]> {
  const { data } = await supabase
    .from("client_document_blocks")
    .select("*")
    .eq("document_id", documentId)
    .order("sort_order");
  return (data ?? []) as ClientDocumentBlock[];
}

export async function writeClientDocEvent(
  supabase: Client,
  opts: {
    documentId: string;
    eventType: string;
    actorUserId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown> | null;
  },
) {
  await supabase.from("client_document_events").insert({
    id: newId(),
    document_id: opts.documentId,
    event_type: opts.eventType,
    actor_user_id: opts.actorUserId ?? null,
    ip: opts.ip ?? null,
    user_agent: opts.userAgent ?? null,
    metadata: opts.metadata ?? null,
    created_at: new Date().toISOString(),
  });
}

export function generateDocToken(): string {
  return randomBytes(24).toString("hex");
}

/** Latest non-revoked token, or null. */
export async function getActiveDocToken(
  supabase: Client,
  documentId: string,
): Promise<{ id: string; token: string } | null> {
  const { data } = await supabase
    .from("client_document_tokens")
    .select("id, token, revoked_at")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false });
  const active = ((data ?? []) as Array<{
    id: string;
    token: string;
    revoked_at: string | null;
  }>).find((t) => !t.revoked_at);
  return active ? { id: active.id, token: active.token } : null;
}

export async function ensureDocToken(
  supabase: Client,
  documentId: string,
  createdBy: string | null,
): Promise<{ token: string; created: boolean }> {
  const existing = await getActiveDocToken(supabase, documentId);
  if (existing) return { token: existing.token, created: false };
  const token = generateDocToken();
  await supabase.from("client_document_tokens").insert({
    id: newId(),
    document_id: documentId,
    token,
    expires_at: null,
    revoked_at: null,
    created_by: createdBy,
    created_at: new Date().toISOString(),
  });
  return { token, created: true };
}

export async function revokeDocTokens(supabase: Client, documentId: string) {
  await supabase
    .from("client_document_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("document_id", documentId);
}

/** Starter blocks for a brand-new document, prefilled from company defaults. */
export function starterBlocks(
  documentId: string,
  settings: CompanySettings,
  opts: { projectName: string; clientName: string | null },
): ClientDocumentBlock[] {
  const order: ClientDocBlockType[] = [
    "cover",
    "intro",
    "project_summary",
    "pricing",
    "terms",
    "payment_instructions",
    "acceptance",
    "contact",
  ];
  const now = new Date().toISOString();
  return order.map((type, index) => {
    const content = defaultBlockContent(type);
    if (type === "cover") {
      content.heading = opts.projectName;
      content.subheading = opts.clientName
        ? `Prepared for ${opts.clientName}`
        : "";
    }
    if (type === "terms" && settings.default_terms) {
      content.body = settings.default_terms;
    }
    if (
      type === "payment_instructions" &&
      settings.default_payment_instructions
    ) {
      content.body = settings.default_payment_instructions;
    }
    if (type === "contact") {
      content.body = [
        settings.legal_name,
        settings.contact_email,
        settings.contact_phone,
        settings.address,
      ]
        .filter(Boolean)
        .join("\n");
    }
    return {
      id: newId(),
      document_id: documentId,
      block_type: type,
      sort_order: index,
      hidden: false,
      content,
      created_at: now,
      updated_at: now,
    } as ClientDocumentBlock;
  });
}

export function requestIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip");
}

export type TokenResolution =
  | { ok: true; document: ClientDocument; tokenId: string }
  | { ok: false; reason: "not_found" | "revoked" | "voided" };

/**
 * Resolve a public share token to its document (service client — bypasses
 * staff auth by design; token possession is the credential).
 */
export async function resolveDocumentByToken(
  supabase: Client,
  token: string,
): Promise<TokenResolution> {
  const cleaned = String(token ?? "").trim();
  if (!/^[a-f0-9]{40,64}$/i.test(cleaned)) {
    return { ok: false, reason: "not_found" };
  }
  const { data: tokenRow } = await supabase
    .from("client_document_tokens")
    .select("id, document_id, revoked_at, expires_at")
    .eq("token", cleaned)
    .maybeSingle();
  if (!tokenRow) return { ok: false, reason: "not_found" };
  if (tokenRow.revoked_at) return { ok: false, reason: "revoked" };
  if (
    tokenRow.expires_at &&
    new Date(String(tokenRow.expires_at)).getTime() < Date.now()
  ) {
    return { ok: false, reason: "revoked" };
  }

  const { data: document } = await supabase
    .from("client_documents")
    .select("*")
    .eq("id", tokenRow.document_id)
    .maybeSingle();
  if (!document) return { ok: false, reason: "not_found" };
  const doc = document as ClientDocument;
  if (doc.status === "voided" || doc.archived_at) {
    return { ok: false, reason: "voided" };
  }
  return { ok: true, document: doc, tokenId: String(tokenRow.id) };
}
