import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canViewFinancials, getCurrentProfile } from "@/lib/auth";
import { getCompanySettings } from "@/lib/company-settings";
import { canAccessProject } from "@/lib/project-access";
import {
  getDocForProject,
  listDocBlocks,
} from "@/lib/projects/client-documents-server";
import { buildClientDocumentPdf } from "@/lib/projects/export-client-document-pdf";
import type { ClientDocumentSignature } from "@/lib/types";

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

  const [blocks, settings, { data: project }, { data: signatures }] =
    await Promise.all([
      listDocBlocks(supabase, docId),
      getCompanySettings(supabase),
      supabase
        .from("projects")
        .select("project_number, name, clients(name)")
        .eq("id", projectId)
        .maybeSingle(),
      supabase
        .from("client_document_signatures")
        .select("*")
        .eq("document_id", docId)
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
      "Content-Disposition": `attachment; filename="${document.doc_number}-${document.name.replace(/[^a-zA-Z0-9-_ ]/g, "")}.pdf"`,
    },
  });
}
