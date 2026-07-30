
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT || 8092);
const DATA = process.env.FILES_DATA_DIR || "./data";
const SECRET = process.env.SIGNING_SECRET || "dev";
fs.mkdirSync(DATA, { recursive: true });

// Lightweight JSON metadata store (Postgres optional later)
const META = path.join(DATA, "meta.json");
function loadMeta() {
  if (!fs.existsSync(META)) return { files: [] };
  return JSON.parse(fs.readFileSync(META, "utf8"));
}
function saveMeta(m) {
  fs.writeFileSync(META, JSON.stringify(m, null, 2));
}

function sign(id, exp) {
  return crypto.createHmac("sha256", SECRET).update(`${id}:${exp}`).digest("hex");
}

function send(res, status, data, headers = {}) {
  const body = typeof data === "string" ? data : JSON.stringify(data);
  res.writeHead(status, {
    "content-type": typeof data === "string" ? "text/plain" : "application/json",
    ...headers,
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  try {
    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, { ok: true, service: "mixinary-shared-files" });
    }

    if (req.method === "GET" && url.pathname.startsWith("/v1/projects/") && url.pathname.endsWith("/files")) {
      const projectId = url.pathname.split("/")[3];
      const meta = loadMeta();
      return send(res, 200, {
        files: meta.files.filter((f) => f.erpProjectId === projectId || f.planeProjectId === projectId),
      });
    }

    if (req.method === "POST" && url.pathname === "/v1/files") {
      const buf = await readBody(req);
      const name = req.headers["x-file-name"] || "upload.bin";
      const erpProjectId = req.headers["x-erp-project-id"] || "";
      const planeProjectId = req.headers["x-plane-project-id"] || "";
      const id = randomUUID();
      const dest = path.join(DATA, id);
      fs.writeFileSync(dest, buf);
      const meta = loadMeta();
      const entry = {
        id,
        name: String(name),
        erpProjectId: String(erpProjectId),
        planeProjectId: String(planeProjectId),
        size: buf.length,
        createdAt: new Date().toISOString(),
      };
      meta.files.push(entry);
      saveMeta(meta);
      const exp = Math.floor(Date.now() / 1000) + 3600;
      return send(res, 201, {
        file: entry,
        secureUrl: `/shared-files/v1/files/${id}?exp=${exp}&sig=${sign(id, exp)}`,
      });
    }

    if (req.method === "GET" && url.pathname.startsWith("/v1/files/")) {
      const id = url.pathname.split("/")[3];
      const exp = Number(url.searchParams.get("exp") || 0);
      const sig = url.searchParams.get("sig") || "";
      if (!exp || exp < Math.floor(Date.now() / 1000) || sign(id, exp) !== sig) {
        return send(res, 403, { error: "invalid or expired link" });
      }
      const filePath = path.join(DATA, id);
      if (!fs.existsSync(filePath)) return send(res, 404, { error: "not found" });
      const meta = loadMeta().files.find((f) => f.id === id);
      res.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="${meta?.name || id}"`,
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    send(res, 404, { error: "not found" });
  } catch (err) {
    send(res, 500, { error: String(err.message || err) });
  }
});

server.listen(PORT, () => console.log(`mixinary-shared-files on :${PORT}`));
