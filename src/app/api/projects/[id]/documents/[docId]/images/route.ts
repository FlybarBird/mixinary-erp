import { NextResponse } from "next/server";
import { canEditClientDocuments, getCurrentProfile } from "@/lib/auth";
import { saveClientDocumentImage } from "@/lib/client-document-images";
import { getDocForProject } from "@/lib/projects/client-documents-server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id: projectId, docId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditClientDocuments(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const document = await getDocForProject(supabase, projectId, docId);
  if (!document) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose an image file" }, { status: 400 });
  }

  try {
    const saved = await saveClientDocumentImage(
      docId,
      Buffer.from(await file.arrayBuffer()),
    );
    return NextResponse.json(saved);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Image upload failed" },
      { status: 400 },
    );
  }
}
