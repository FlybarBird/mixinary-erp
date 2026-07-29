import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import { requireProjectApiContext } from "@/lib/project-guard";
import { isLocalMode } from "@/lib/local/db";

const LOCAL_FILES_DIR = path.join(process.cwd(), ".data", "project-files");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const { id: projectId, attachmentId } = await params;
  const ctx = await requireProjectApiContext(projectId);
  if (ctx instanceof NextResponse) return ctx;

  const supabase = await createClient();
  const { data: attachment } = await supabase
    .from("attachments")
    .select("*")
    .eq("id", attachmentId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const filePath = attachment.file_path as string;
  const fileName = attachment.file_name as string;

  if (isLocalMode() || filePath.startsWith("local:")) {
    const cleanPath = filePath.startsWith("local:") ? filePath.slice(6) : filePath;
    // cleanPath is like "{projectId}/{timestamp}-{safeFileName}"
    const parts = cleanPath.split("/");
    const dir = path.join(LOCAL_FILES_DIR, projectId);
    let found: string | null = null;

    if (fs.existsSync(dir)) {
      // Find matching file by suffix (safeFileName part after timestamp-)
      const suffix = parts[parts.length - 1].split("-").slice(1).join("-");
      const files = fs.readdirSync(dir);
      found = files.find((f) => f.endsWith(suffix) || f === parts[parts.length - 1]) ?? null;
    }

    if (!found) {
      return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(path.join(dir, found));
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Type": "application/octet-stream",
        "Content-Length": String(fileBuffer.length),
      },
    });
  }

  // Supabase storage: get signed URL
  try {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const service = createServiceClient();
    const { data, error } = await service.storage
      .from("project-files")
      .createSignedUrl(filePath, 60);
    if (error || !data?.signedUrl) throw new Error(error?.message ?? "No URL");
    return NextResponse.redirect(data.signedUrl);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Download failed" },
      { status: 500 },
    );
  }
}
