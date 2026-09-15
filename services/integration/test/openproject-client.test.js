import test from "node:test";
import assert from "node:assert/strict";
import { toProjectIdentifier } from "../src/openproject-client.js";

test("toProjectIdentifier slugs names", () => {
  assert.equal(toProjectIdentifier("Mixinary AVL 2026"), "mixinary-avl-2026");
  assert.equal(toProjectIdentifier("!!!"), "project");
});

test("hmac + openproject client modules load", async () => {
  const crypto = await import("../src/crypto.js");
  const body = "{}";
  const sig = crypto.signPayload("secret", body);
  assert.equal(crypto.verifySignature("secret", body, sig), true);
});
