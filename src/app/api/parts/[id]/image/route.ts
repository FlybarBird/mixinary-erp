import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { canEditPricing, getCurrentProfile } from "@/lib/auth";
import { isLocalMode } from "@/lib/local/db";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile || !canEditPricing(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const remoteUrl = String(form.get("url") || "");

  let buffer: Buffer | null = null;
  let ext = "jpg";
  let contentType = "image/jpeg";

  if (file instanceof File) {
    buffer = Buffer.from(await file.arrayBuffer());
    contentType = file.type || "image/jpeg";
    ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  } else if (remoteUrl) {
    const res = await fetch(remoteUrl, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to download image (${res.status})` },
        { status: 400 },
      );
    }
    buffer = Buffer.from(await res.arrayBuffer());
    contentType = res.headers.get("content-type") || "image/jpeg";
    if (contentType.includes("png")) ext = "png";
    else if (contentType.includes("webp")) ext = "webp";
  } else {
    return NextResponse.json(
      { error: "file or url required" },
      { status: 400 },
    );
  }

  const objectPath = `${id}.${ext}`;
  let imagePath = objectPath;
  let imageUrl: string | null = null;

  if (isLocalMode()) {
    const root = path.join(process.cwd(), ".data", "part-images");
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, objectPath), buffer);
    imagePath = objectPath;
    imageUrl = `/api/parts/images/${objectPath}`;
  } else {
    const service = createServiceClient();
    const { error: uploadError } = await service.storage
      .from("part-images")
      .upload(objectPath, buffer, { contentType, upsert: true });
    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message },
        { status: 400 },
      );
    }
    const { data } = service.storage
      .from("part-images")
      .getPublicUrl(objectPath);
    imageUrl = data.publicUrl;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalog_parts")
    .update({
      image_path: imagePath,
      image_url: imageUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data });
}
