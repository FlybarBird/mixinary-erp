import { createHmac } from "node:crypto";
import { suiteConfig } from "@/lib/suite/config";

function sign(body: string) {
  const secret = suiteConfig().integrationSecret;
  if (!secret) return "";
  return createHmac("sha256", secret).update(body).digest("hex");
}

export async function publishIntegrationEvent(input: {
  eventType: string;
  idempotencyKey: string;
  data: Record<string, unknown>;
}) {
  const { integrationBaseUrl, integrationSecret } = suiteConfig();
  if (!integrationBaseUrl) {
    return { skipped: true, reason: "INTEGRATION_BASE_URL not set" };
  }

  const body = JSON.stringify({
    eventType: input.eventType,
    idempotencyKey: input.idempotencyKey,
    data: input.data,
  });

  try {
    const res = await fetch(`${integrationBaseUrl}/v1/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(integrationSecret
          ? { "x-mixinary-signature": sign(body) }
          : {}),
      },
      body,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("integration event failed", res.status, json);
      return { ok: false, status: res.status, json };
    }
    return { ok: true, json };
  } catch (err) {
    // Async boundary: ERP project create must not fail if Plane/integration is down.
    console.error("integration event error", err);
    return { ok: false, error: String(err) };
  }
}

export async function getProjectMapping(erpProjectId: string) {
  const { integrationBaseUrl } = suiteConfig();
  if (!integrationBaseUrl) return null;
  try {
    const res = await fetch(
      `${integrationBaseUrl}/v1/projects/mapping?erpProjectId=${encodeURIComponent(erpProjectId)}`,
      { next: { revalidate: 0 } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      mapping: {
        plane_project_id: string | null;
        integration_status: string;
        erp_project_number?: string | null;
      } | null;
    };
    return json.mapping;
  } catch {
    return null;
  }
}

export async function getPlaneProgress(erpProjectId: string) {
  const { integrationBaseUrl } = suiteConfig();
  if (!integrationBaseUrl) return null;
  try {
    const res = await fetch(
      `${integrationBaseUrl}/v1/progress?erpProjectId=${encodeURIComponent(erpProjectId)}`,
      { next: { revalidate: 0 } },
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export function verifyIntegrationSignature(rawBody: string, signature: string | null) {
  const secret = suiteConfig().integrationSecret;
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!signature) return false;
  const expected = sign(rawBody);
  if (expected.length !== signature.length) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  // timing-safe
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a[i]! ^ b[i]!;
  return out === 0;
}
