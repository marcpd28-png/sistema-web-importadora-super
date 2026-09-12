import test from "node:test";
import assert from "node:assert";
import crypto from "crypto";
import { resolveMessageStatusTransition } from "./messages-service";
import { assertSameLogicalMessage, mergeMessages } from "./messages-core";
import { extractMetaStatuses, verifyMetaSignature } from "../app/api/webhook/whatsapp/route";

test("Message Center Stabilization Tests", async (t) => {
  await t.test("resolveMessageStatusTransition normal", () => {
    assert.strictEqual(resolveMessageStatusTransition(null, "sending"), "sending");
    assert.strictEqual(resolveMessageStatusTransition("sending", "sent"), "sent");
    assert.strictEqual(resolveMessageStatusTransition("sent", "delivered"), "delivered");
    assert.strictEqual(resolveMessageStatusTransition("delivered", "read"), "read");
  });

  await t.test("read no degrada a delivered", () => {
    assert.strictEqual(resolveMessageStatusTransition("read", "delivered"), "read");
  });

  await t.test("delivered no degrada a sent", () => {
    assert.strictEqual(resolveMessageStatusTransition("delivered", "sent"), "delivered");
  });

  await t.test("delivered/read no pasan a failed por evento tardío", () => {
    assert.strictEqual(resolveMessageStatusTransition("delivered", "failed"), "delivered");
    assert.strictEqual(resolveMessageStatusTransition("read", "failed"), "read");
  });

  // WEBHOOK SIGNATURES
  const secret = "test_secret";
  const body = JSON.stringify({ test: true });
  const validSignature = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");

  await t.test("verifyMetaSignature firma correcta", () => {
    const ok = verifyMetaSignature({ rawBody: body, signatureHeader: validSignature, appSecret: secret });
    assert.strictEqual(ok, true);
  });

  await t.test("verifyMetaSignature firma incorrecta", () => {
    const ok = verifyMetaSignature({ rawBody: body, signatureHeader: "sha256=abcdef", appSecret: secret });
    assert.strictEqual(ok, false);
  });

  await t.test("verifyMetaSignature firma ausente", () => {
    const ok = verifyMetaSignature({ rawBody: body, signatureHeader: null, appSecret: secret });
    assert.strictEqual(ok, false);
  });

  await t.test("verifyMetaSignature firma hexadecimal inválida", () => {
    const ok = verifyMetaSignature({ rawBody: body, signatureHeader: "sha256=invalidhex_zz", appSecret: secret });
    assert.strictEqual(ok, false);
  });

  await t.test("missing secret fail closed", () => {
    try {
      verifyMetaSignature({ rawBody: body, signatureHeader: validSignature, appSecret: undefined, isProduction: true });
      assert.fail("Debería lanzar error");
    } catch (error: any) {
      assert.strictEqual(error.message, "MISSING_APP_SECRET");
    }
  });

  // EXTRACTORS
  await t.test("extractMetaStatuses", () => {
    const payload = {
      entry: [{
        changes: [{
          value: {
            statuses: [{
              id: "msg_123",
              status: "delivered",
              timestamp: "123456",
              errors: [{ code: 131009 }]
            }]
          }
        }]
      }]
    };
    const statuses = extractMetaStatuses(payload);
    assert.strictEqual(statuses.length, 1);
    assert.strictEqual(statuses[0].id, "msg_123");
    assert.strictEqual(statuses[0].status, "delivered");
    assert.strictEqual(statuses[0].timestamp, "123456");
    assert.deepStrictEqual(statuses[0].errors, [{ code: 131009 }]);
  });

  // IDEMPOTENCY KEY REUSE
  await t.test("idempotency same key + mismo payload = permitido", () => {
    const base = { conversationId: "c1", direction: "OUTBOUND", senderType: "AGENT", messageType: "TEXT", content: "hello", mediaUrl: null };
    assert.strictEqual(assertSameLogicalMessage(base, base), true);
  });

  await t.test("same key + otro conversationId = conflict", () => {
    const existing = { conversationId: "c1", direction: "OUTBOUND", senderType: "AGENT", messageType: "TEXT", content: "hello", mediaUrl: null };
    const requested = { ...existing, conversationId: "c2" };
    assert.strictEqual(assertSameLogicalMessage(existing, requested), false);
  });

  await t.test("same key + otro content = conflict", () => {
    const existing = { conversationId: "c1", direction: "OUTBOUND", senderType: "AGENT", messageType: "TEXT", content: "hello", mediaUrl: null };
    const requested = { ...existing, content: "hello world" };
    assert.strictEqual(assertSameLogicalMessage(existing, requested), false);
  });

  await t.test("same key + otro messageType = conflict", () => {
    const existing = { conversationId: "c1", direction: "OUTBOUND", senderType: "AGENT", messageType: "TEXT", content: "hello", mediaUrl: null };
    const requested = { ...existing, messageType: "IMAGE" };
    assert.strictEqual(assertSameLogicalMessage(existing, requested), false);
  });

  await t.test("same key + otro mediaUrl = conflict", () => {
    const existing = { conversationId: "c1", direction: "OUTBOUND", senderType: "AGENT", messageType: "IMAGE", content: "img", mediaUrl: "url1" };
    const requested = { ...existing, mediaUrl: "url2" };
    assert.strictEqual(assertSameLogicalMessage(existing, requested), false);
  });

  // MESSAGE RECONCILIATION
  await t.test("reconciliación: existing sent, incoming delivered mismo ID -> delivered", () => {
    const existing = [{ id: "1", clientRequestId: "A", status: "sent", createdAt: "2024-01-01T10:00:00Z" }];
    const incoming = [{ id: "1", clientRequestId: "A", status: "delivered", createdAt: "2024-01-01T10:00:00Z" }];
    const merged = mergeMessages(existing, incoming);
    assert.strictEqual(merged.length, 1);
    assert.strictEqual(merged[0].status, "delivered");
  });

  await t.test("reconciliación: existing delivered, incoming read mismo ID -> read", () => {
    const existing = [{ id: "1", clientRequestId: "A", status: "delivered", createdAt: "2024-01-01T10:00:00Z" }];
    const incoming = [{ id: "1", clientRequestId: "A", status: "read", createdAt: "2024-01-01T10:00:00Z" }];
    const merged = mergeMessages(existing, incoming);
    assert.strictEqual(merged.length, 1);
    assert.strictEqual(merged[0].status, "read");
  });
});
