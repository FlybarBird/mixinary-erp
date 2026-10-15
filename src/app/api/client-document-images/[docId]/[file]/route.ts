import { NextResponse } from "next/server";
import { canViewFinancials, getCurrentProfile } from "@/lib/auth";
import { readClientDocumentImage } from "@/lib/client-document-images";
import { resolveDocumentByToken } from "@/lib/projects/client-documents-server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type ServiceClient = Awaited<ReturnType<typeof createClient>>;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ docId: string; file: string }> },
) {
  const { docId, file } = await params;
  const token = new URL(request.url).searchParams.get("token") ?? "";

  const profile = await getCurrentProfile();
  let allowed = Boolean(profile && canViewFinancials(profile.role));
  if (!allowed && token) {
    const supabase = createServiceClient() as unknown as ServiceClient;
    const resolution = await resolveDocumentByToken(supabase, token);
    allowed = resolution.ok && resolution.document.id === docId;
  }
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const image = await readClientDocumentImage(docId, file);
  if (!image) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "private, max-age=3600",
      "Content-Length": String(image.data.length),
    },
  });
}
