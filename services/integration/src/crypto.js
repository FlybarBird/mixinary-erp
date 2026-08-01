
import crypto from "node:crypto";

export function signPayload(secret, body) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

export function verifySignature(secret, body, signature) {
  if (!signature) return false;
  const expected = signPayload(secret, body);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
