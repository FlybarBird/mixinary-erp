
import http from "node:http";
import { verifySignature } from "./crypto.js";
import {
  enqueueEvent,
  processOutboxBatch,
  handleProjectCreated,
  handleUserProvision,
  handleUserDisable,
  handleWorklog,
} from "./handlers.js";
import { query } from "./db.js";

const PORT = Number(process.env.PORT || 8091);
const SECRET = process.env.WEBHOOK_SIGNING_SECRET || "";

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body);
}

function unauthorized(res) {
  send(res, 401, { error: "invalid signature" });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);

    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, { ok: true, service: "mixinary-integration" });
    }

    if (req.method === "GET" && url.pathname === "/v1/projects/mapping") {
      const erpId = url.searchParams.get("erpProjectId");
      if (!erpId) return send(res, 400, { error: "erpProjectId required" });
      const { rows } = await query(`select * from project_map where erp_project_id=$1`, [erpId]);
      return send(res, 200, { mapping: rows[0] ?? null });
    }

    if (req.method === "GET" && url.pathname === "/v1/progress") {
      const erpId = url.searchParams.get("erpProjectId");
      // Progress is supplied by Plane webhooks into mapping detail later; stub summary.
      const { rows } = await query(`select * from project_map where erp_project_id=$1`, [erpId]);
      return send(res, 200, {
        erpProjectId: erpId,
        status: rows[0]?.integration_status ?? "unknown",
        planeProjectId: rows[0]?.plane_project_id ?? null,
        summary: rows[0] ? { linked: Boolean(rows[0].plane_project_id) } : null,
      });
    }

    const raw = await readBody(req);
    const sig = req.headers["x-mixinary-signature"];

    if (req.method === "POST" && url.pathname === "/v1/events") {
      if (SECRET && !verifySignature(SECRET, raw, sig)) return unauthorized(res);
      const payload = JSON.parse(raw || "{}");
      const { eventType, idempotencyKey, data } = payload;
      if (!eventType || !idempotencyKey) {
        return send(res, 400, { error: "eventType and idempotencyKey required" });
      }
      const row = await enqueueEvent(eventType, idempotencyKey, data ?? {});
      // Opportunistic process
      setImmediate(() => { processOutboxBatch().catch(console.error); });
      return send(res, 202, { accepted: true, event: row });
    }

    if (req.method === "POST" && url.pathname === "/v1/webhooks/plane") {
      if (SECRET && !verifySignature(SECRET, raw, sig)) return unauthorized(res);
      const payload = JSON.parse(raw || "{}");
      const key = payload.idempotencyKey || payload.id || `${payload.eventType}:${JSON.stringify(payload.data||{})}`;
      await query(
        `insert into webhook_receipts (idempotency_key, source, event_type, payload)
         values ($1,'plane',$2,$3)
         on conflict (idempotency_key) do nothing`,
        [key, payload.eventType || "unknown", payload],
      );
      if (payload.eventType === "worklog.created") {
        await enqueueEvent("worklog.created", key, payload.data || payload);
        setImmediate(() => { processOutboxBatch().catch(console.error); });
      }
      return send(res, 202, { accepted: true });
    }

    if (req.method === "POST" && url.pathname === "/v1/admin/process-outbox") {
      if (SECRET && !verifySignature(SECRET, raw, sig)) return unauthorized(res);
      const results = await processOutboxBatch();
      return send(res, 200, { results });
    }

    // Direct helpers for tests / admin
    if (req.method === "POST" && url.pathname === "/v1/admin/project-created") {
      if (SECRET && !verifySignature(SECRET, raw, sig)) return unauthorized(res);
      const data = JSON.parse(raw || "{}");
      return send(res, 200, await handleProjectCreated(data));
    }
    if (req.method === "POST" && url.pathname === "/v1/admin/user-provision") {
      if (SECRET && !verifySignature(SECRET, raw, sig)) return unauthorized(res);
      return send(res, 200, await handleUserProvision(JSON.parse(raw || "{}")));
    }
    if (req.method === "POST" && url.pathname === "/v1/admin/user-disable") {
      if (SECRET && !verifySignature(SECRET, raw, sig)) return unauthorized(res);
      return send(res, 200, await handleUserDisable(JSON.parse(raw || "{}")));
    }
    if (req.method === "POST" && url.pathname === "/v1/admin/worklog") {
      if (SECRET && !verifySignature(SECRET, raw, sig)) return unauthorized(res);
      return send(res, 200, await handleWorklog(JSON.parse(raw || "{}")));
    }

    send(res, 404, { error: "not found" });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: String(err.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`mixinary-integration listening on :${PORT}`);
  setInterval(() => {
    processOutboxBatch().catch(console.error);
  }, 15000);
});
