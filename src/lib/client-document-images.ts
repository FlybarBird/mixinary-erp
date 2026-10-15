import fs from "node:fs";
import path from "node:path";
import { isLocalMode, newId } from "@/lib/local/db";
import {
  clientDocumentImageUrl,
  detectImageType,
} from "@/lib/client-document-image-url";

export {
  clientDocumentImageSrc,
  clientDocumentImageUrl,
  detectImageType,
  parseClientDocumentImageUrl,
} from "@/lib/client-document-image-url";

export const CLIENT_DOCUMENT_IMAGE_BUCKET = "client-document-images";
const ROOT = path.join(process.cwd(), ".data", CLIENT_DOCUMENT_IMAGE_BUCKET);
const MAX_BYTES = 8 * 1024 * 1024;

const DOC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpe?g|png|webp|gif)$/i;

function contentTypeFor(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

function localFile(docId: string, fileName: string) {
  const full = path.resolve(ROOT, docId, fileName);
  const root = path.resolve(ROOT);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

export async function saveClientDocumentImage(docId: string, buffer: Buffer) {
  if (!DOC_ID.test(docId)) {
    throw new Error("Invalid document");
  }
  if (buffer.length === 0) throw new Error("That file is empty");
  if (buffer.length > MAX_BYTES) throw new Error("Image must be 8 MB or smaller");
  const kind = detectImageType(buffer);
  if (!kind) throw new Error("Use a JPEG, PNG, WebP, or GIF image");

  const fileName = `${newId()}.${kind.ext}`;
  const objectPath = `${docId}/${fileName}`;

  if (!isLocalMode()) {
    try {
      const { createServiceClient } = await import("@/lib/supabase/server");
      const service = createServiceClient();
      const { error } = await service.storage
        .from(CLIENT_DOCUMENT_IMAGE_BUCKET)
        .upload(objectPath, buffer, {
          contentType: kind.contentType,
          upsert: false,
        });
      if (!error) return { url: clientDocumentImageUrl(docId, fileName) };
    } catch {
      // Fall through to the local file when storage is not configured.
    }
  }

  const full = localFile(docId, fileName);
  if (!full) throw new Error("Could not store that image");
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, buffer);
  return { url: clientDocumentImageUrl(docId, fileName) };
}

export async function readClientDocumentImage(docId: string, fileName: string) {
  if (!DOC_ID.test(docId) || !FILE_NAME.test(fileName)) return null;
  const full = localFile(docId, fileName);
  if (full && fs.existsSync(full)) {
    return {
      data: fs.readFileSync(full),
      contentType: contentTypeFor(fileName),
    };
  }
  if (isLocalMode()) return null;

  try {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const service = createServiceClient();
    const { data, error } = await service.storage
      .from(CLIENT_DOCUMENT_IMAGE_BUCKET)
      .download(`${docId}/${fileName}`);
    if (error || !data) return null;
    const bytes = Buffer.from(await data.arrayBuffer());
    return { data: bytes, contentType: contentTypeFor(fileName) };
  } catch {
    return null;
  }
}
