import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCompanySettings } from "@/lib/company-settings";
import {
  listDocBlocks,
  resolveDocumentByToken,
} from "@/lib/projects/client-documents-server";
import { buildClientDocumentPdf } from "@/lib/projects/export-client-document-pdf";
import type { ClientDocumentSignature } from "@/lib/types";

type ServiceClient = Awaited<ReturnType<typeof createClient>>;

/** Token-gated PDF download for the customer. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const supabase = createServiceClient() as unknown as ServiceClient;
  const resolution = await resolveDocumentByToken(supabase, token);
  if (!resolution.ok) {
    return NextResponse.json({ error: "Link unavailable" }, { status: 404 });
  }
  const document = resolution.document;

  const [blocks, settings, { data: project }, { data: signatures }] =
    await Promise.all([
      listDocBlocks(supabase, document.id),
      getCompanySettings(supabase),
      supabase
        .from("projects")
        .select("project_number, name, clients(name)")
        .eq("id", document.project_id)
        .maybeSingle(),
      supabase
        .from("client_document_signatures")
        .select("*")
        .eq("document_id", document.id)
        .order("signed_at"),
    ]);

  const pdf = await buildClientDocumentPdf({
    document,
    blocks,
    settings,
    projectNumber: String(project?.project_number ?? ""),
    projectName: String(project?.name ?? ""),
    clientName: (project?.clients as { name?: string } | null)?.name ?? null,
    signatures: (signatures ?? []) as ClientDocumentSignature[],
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${document.doc_number}.pdf"`,
    },
  });
}
