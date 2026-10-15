export type StoredImageKind = {
  ext: "jpg" | "png" | "webp" | "gif";
  contentType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
};

/** Identify a JPEG, PNG, WebP, or GIF from its header. */
export function detectImageType(buffer: Buffer): StoredImageKind | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: "jpg", contentType: "image/jpeg" };
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { ext: "png", contentType: "image/png" };
  }
  if (
    buffer.subarray(0, 6).toString("ascii") === "GIF87a" ||
    buffer.subarray(0, 6).toString("ascii") === "GIF89a"
  ) {
    return { ext: "gif", contentType: "image/gif" };
  }
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { ext: "webp", contentType: "image/webp" };
  }
  return null;
}

const DOC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpe?g|png|webp|gif)$/i;

export function clientDocumentImageUrl(docId: string, fileName: string) {
  return `/api/client-document-images/${docId}/${fileName}`;
}

/** Append a customer share token so the public quote can load a stored image. */
export function clientDocumentImageSrc(url: string, shareToken?: string | null) {
  if (!shareToken || !parseClientDocumentImageUrl(url)) return url;
  const join = url.includes("?") ? "&" : "?";
  return `${url}${join}token=${encodeURIComponent(shareToken)}`;
}

export function parseClientDocumentImageUrl(url: string): {
  docId: string;
  fileName: string;
} | null {
  const pathOnly = url.split("?")[0] ?? "";
  const match = pathOnly.match(/^\/api\/client-document-images\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  const docId = match[1] ?? "";
  const fileName = match[2] ?? "";
  if (!DOC_ID.test(docId) || !FILE_NAME.test(fileName)) return null;
  return { docId, fileName };
}
