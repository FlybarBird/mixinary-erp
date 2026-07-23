import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import {
  canEditBom,
  canEditExpenses,
  canManageProcurement,
  getCurrentProfile,
} from "@/lib/auth";
import { getLocalDb, isLocalMode, newId } from "@/lib/local/db";

const LOCAL_FILES_DIR = path.join(process.cwd(), ".data", "project-files");

function canWrite(role: string) {
  return (
    canEditBom(role as never) ||
    canManageProcurement(role as never) ||
    canEditExpenses(role as never)
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const entityType = url.searchParams.get("entity_type");
  const entityId = url.searchParams.get("entity_id");

  const supabase = await createClient();
  let query = supabase
    .from("attachments")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (entityType) query = query.eq("entity_type", entityType);
  if (entityId) query = query.eq("entity_id", entityId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ attachments: data ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canWrite(profile.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  const entityType = String(form.get("entity_type") ?? "project");
  const entityId = String(form.get("entity_id") ?? projectId);

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${projectId}/${Date.now()}-${safeFileName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const local = isLocalMode();
  let storedPath = filePath;

  if (local) {
    const dir = path.join(LOCAL_FILES_DIR, projectId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${Date.now()}-${safeFileName}`), buffer);
    storedPath = filePath;
  } else {
    // Try Supabase storage; fall back to local filesystem if it fails
    try {
      const { createServiceClient } = await import("@/lib/supabase/server");
      const service = createServiceClient();
      const { error: uploadError } = await service.storage
        .from("project-files")
        .upload(filePath, buffer, { contentType: file.type || "application/octet-stream", upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      storedPath = filePath;
    } catch {
      const dir = path.join(LOCAL_FILES_DIR, projectId);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${Date.now()}-${safeFileName}`), buffer);
      storedPath = `local:${filePath}`;
    }
  }

  const supabase = await createClient();
  const id = newId();
  const { data, error } = await supabase
    .from("attachments")
    .insert({
      id,
      project_id: projectId,
      entity_type: entityType,
      entity_id: entityId,
      file_path: storedPath,
      file_name: file.name,
      uploaded_by: profile.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ attachment: data }, { status: 201 });
}
