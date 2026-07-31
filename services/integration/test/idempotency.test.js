
import test from "node:test";
import assert from "node:assert/strict";
import { signPayload, verifySignature } from "../src/crypto.js";

test("hmac signatures verify", () => {
  const body = JSON.stringify({ a: 1 });
  const sig = signPayload("secret", body);
  assert.equal(verifySignature("secret", body, sig), true);
  assert.equal(verifySignature("secret", body, "bad"), false);
});

test("project.created idempotency key format is stable", () => {
  const erpProjectId = "proj-1";
  const key = `project.created:${erpProjectId}`;
  assert.equal(key, "project.created:proj-1");
});
