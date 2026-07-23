import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { isLocalMode } from "@/lib/local/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (!isLocalMode()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { path: parts } = await params;
  const fileName = parts.join("/");
  if (fileName.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const full = path.join(process.cwd(), ".data", "part-images", fileName);
  if (!fs.existsSync(full)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = fs.readFileSync(full);
  const ext = path.extname(full).toLowerCase();
  const type =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
          ? "image/gif"
          : "image/jpeg";

  return new NextResponse(data, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
