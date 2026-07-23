import fs from "node:fs";
import path from "node:path";
import { isLocalMode } from "@/lib/local/db";
import { createServiceClient } from "@/lib/supabase/server";

/** Download a remote product image into part-images storage; returns local/public URL. */
export async function cacheRemotePartImage(params: {
  partId: string;
  remoteUrl: string;
}): Promise<{ image_path: string; image_url: string } | null> {
  const remoteUrl = params.remoteUrl.trim();
  if (!remoteUrl.startsWith("http://") && !remoteUrl.startsWith("https://")) {
    return null;
  }

  try {
    const res = await fetch(remoteUrl, {
      headers: {
        "User-Agent": "MixinaryERP/1.0 (+catalog image cache)",
        Accept: "image/*,*/*",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length || buffer.byteLength > 5_000_000) return null;

    let ext = "jpg";
    if (contentType.includes("png")) ext = "png";
    else if (contentType.includes("webp")) ext = "webp";
    else if (contentType.includes("gif")) ext = "gif";
    else {
      const fromUrl = remoteUrl.split("?")[0].split(".").pop()?.toLowerCase();
      if (fromUrl && ["jpg", "jpeg", "png", "webp", "gif"].includes(fromUrl)) {
        ext = fromUrl === "jpeg" ? "jpg" : fromUrl;
      }
    }

    const objectPath = `${params.partId}.${ext}`;

    if (isLocalMode()) {
      const root = path.join(process.cwd(), ".data", "part-images");
      fs.mkdirSync(root, { recursive: true });
      fs.writeFileSync(path.join(root, objectPath), buffer);
      return {
        image_path: objectPath,
        image_url: `/api/parts/images/${objectPath}`,
      };
    }

    const service = createServiceClient();
    const { error } = await service.storage
      .from("part-images")
      .upload(objectPath, buffer, { contentType, upsert: true });
    if (error) return null;
    const { data } = service.storage.from("part-images").getPublicUrl(objectPath);
    return { image_path: objectPath, image_url: data.publicUrl };
  } catch {
    return null;
  }
}
