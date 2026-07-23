import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import { canEditBom, canEditExpenses, canManageProcurement, getCurrentProfile } from "@/lib/auth";
import { isLocalMode } from "@/lib/local/db";

const LOCAL_FILES_DIR = path.join(process.cwd(), ".data", "project-files");

function canWrite(role: string) {
  return (
    canEditBom(role as never) ||
    canManageProcurement(role as never) ||
    canEditExpenses(role as never)
  );
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const { id: projectId, attachmentId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canWrite(profile.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  const { data: attachment } = await supabase
    .from("attachments")
    .select("*")
    .eq("id", attachmentId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Remove physical file
  const filePath = attachment.file_path as string;
  if (isLocalMode() || filePath.startsWith("local:")) {
    const cleanPath = filePath.startsWith("local:") ? filePath.slice(6) : filePath;
    const parts = cleanPath.split("/");
    const fileName = parts[parts.length - 1];
    const dir = path.join(LOCAL_FILES_DIR, projectId);
    const candidates = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((f) => f.endsWith(fileName.split("-").slice(1).join("-")))
      : [];
    for (const c of candidates) {
      try { fs.unlinkSync(path.join(dir, c)); } catch { /* best effort */ }
    }
  } else {
    try {
      const { createServiceClient } = await import("@/lib/supabase/server");
      const service = createServiceClient();
      await service.storage.from("project-files").remove([filePath]);
    } catch { /* best effort */ }
  }

  const { error } = await supabase.from("attachments").delete().eq("id", attachmentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
