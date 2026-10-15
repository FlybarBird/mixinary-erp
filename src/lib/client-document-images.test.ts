import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clientDocumentImageSrc,
  detectImageType,
  parseClientDocumentImageUrl,
} from "./client-document-images";

const DOC = "11111111-1111-4111-8111-111111111111";
const FILE = "22222222-2222-4222-8222-222222222222.jpg";

describe("client document images", () => {
  it("recognizes jpeg, png, gif, and webp headers", () => {
    const jpeg = Buffer.alloc(12, 0);
    jpeg[0] = 0xff;
    jpeg[1] = 0xd8;
    jpeg[2] = 0xff;
    assert.equal(detectImageType(jpeg)?.ext, "jpg");
    const png = Buffer.alloc(12, 0);
    png.set([0x89, 0x50, 0x4e, 0x47], 0);
    assert.equal(detectImageType(png)?.contentType, "image/png");
    const gif = Buffer.alloc(12, 0);
    gif.write("GIF89a");
    assert.equal(detectImageType(gif)?.ext, "gif");
    const webp = Buffer.alloc(12);
    webp.write("RIFF", 0);
    webp.write("WEBP", 8);
    assert.equal(detectImageType(webp)?.ext, "webp");
    assert.equal(detectImageType(Buffer.from("<svg></svg>")), null);
  });

  it("parses only stored quote image urls", () => {
    const url = `/api/client-document-images/${DOC}/${FILE}`;
    assert.deepEqual(parseClientDocumentImageUrl(url), { docId: DOC, fileName: FILE });
    assert.deepEqual(parseClientDocumentImageUrl(`${url}?token=abc`), {
      docId: DOC,
      fileName: FILE,
    });
    assert.equal(parseClientDocumentImageUrl("https://example.com/photo.jpg"), null);
    assert.equal(
      parseClientDocumentImageUrl(`/api/client-document-images/${DOC}/../secret.jpg`),
      null,
    );
  });

  it("adds the share token only for stored images", () => {
    const url = `/api/client-document-images/${DOC}/${FILE}`;
    assert.equal(
      clientDocumentImageSrc(url, "abc"),
      `${url}?token=abc`,
    );
    assert.equal(clientDocumentImageSrc("https://cdn.example/a.jpg", "abc"), "https://cdn.example/a.jpg");
    assert.equal(clientDocumentImageSrc(url, null), url);
  });
});
