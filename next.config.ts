import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "better-sqlite3",
    "pdf-parse",
    "pdfjs-dist",
    "pdfkit",
    "@napi-rs/canvas",
  ],
};

export default nextConfig;
