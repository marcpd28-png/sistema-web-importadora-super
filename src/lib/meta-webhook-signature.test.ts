import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { verifyMetaWebhookSignature } from "@/lib/meta-webhook-signature";

const rawBody = JSON.stringify({ object: "whatsapp_business_account" });
const appSecret = "test-app-secret";

function validHeader() {
  const digest = createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");
  return `sha256=${digest}`;
}

test("accepts a valid Meta SHA-256 webhook signature", () => {
  assert.equal(
    verifyMetaWebhookSignature({
      appSecret,
      rawBody,
      signatureHeader: validHeader(),
    }),
    "VALID",
  );
});

test("rejects missing, malformed, or incorrect signatures", () => {
  for (const signatureHeader of [
    null,
    "",
    "sha1=abc",
    "sha256=abc",
    `sha256=${"0".repeat(64)}`,
  ]) {
    assert.equal(
      verifyMetaWebhookSignature({
        appSecret,
        rawBody,
        signatureHeader,
      }),
      "INVALID",
    );
  }
});

test("fails closed when the Meta app secret is not configured", () => {
  assert.equal(
    verifyMetaWebhookSignature({
      appSecret: "",
      rawBody,
      signatureHeader: validHeader(),
    }),
    "MISSING_SECRET",
  );
});
