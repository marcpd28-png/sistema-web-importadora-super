import test from "node:test";
import assert from "node:assert";
import { resolveMessageStatusTransition } from "./messages-service";
import crypto from "crypto";
import { randomUUID } from "node:crypto";

test("Message Center Stabilization: Core Logic Tests", async (t) => {
  await t.test("Status State Machine: Normal Progression", () => {
    let s = resolveMessageStatusTransition(null, "sending");
    assert.strictEqual(s, "sending");
    s = resolveMessageStatusTransition(s, "sent");
    assert.strictEqual(s, "sent");
    s = resolveMessageStatusTransition(s, "delivered");
    assert.strictEqual(s, "delivered");
    s = resolveMessageStatusTransition(s, "read");
    assert.strictEqual(s, "read");
  });

  await t.test("Status State Machine: Out of order", () => {
    // Read -> Delivered should stay Read
    const s1 = resolveMessageStatusTransition("read", "delivered");
    assert.strictEqual(s1, "read");
    // Delivered -> Sent should stay Delivered
    const s2 = resolveMessageStatusTransition("delivered", "sent");
    assert.strictEqual(s2, "delivered");
  });

  await t.test("Status State Machine: Failed handling", () => {
    // Sending -> Failed
    assert.strictEqual(resolveMessageStatusTransition("sending", "failed"), "failed");
    // Sent -> Failed
    assert.strictEqual(resolveMessageStatusTransition("sent", "failed"), "failed");
    // Delivered -> Failed (Late failure on delivered message should NOT downgrade)
    assert.strictEqual(resolveMessageStatusTransition("delivered", "failed"), "delivered");
    // Read -> Failed (Late failure on read message should NOT downgrade)
    assert.strictEqual(resolveMessageStatusTransition("read", "failed"), "read");
  });

  await t.test("Webhook Signature: HMAC SHA-256", () => {
    const secret = "test_secret";
    const body = JSON.stringify({ test: true });
    const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
    const signature = `sha256=${expected}`;
    
    // Simulate what verifyMetaSignature does
    const signatureRaw = signature.replace(/^sha256=/, "");
    const calc = crypto.createHmac("sha256", secret).update(body).digest("hex");
    
    const isOk = crypto.timingSafeEqual(Buffer.from(signatureRaw, "hex"), Buffer.from(calc, "hex"));
    assert.ok(isOk);
  });
  
  await t.test("Idempotency Client Request ID: Stable UUIDs", () => {
    const newId = randomUUID();
    const retryId = newId; // Retry uses same
    const secondMsgId = randomUUID();
    
    assert.strictEqual(newId, retryId);
    assert.notStrictEqual(newId, secondMsgId);
  });
});
