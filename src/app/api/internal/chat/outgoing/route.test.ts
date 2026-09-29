import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";

test("registra el rechazo de un PDF como failed y conserva la razón segura y requestId", async (t) => {
  const before = process.env.N8N_INTERNAL_API_KEY;
  const previousPrisma = global.prismaGlobal;
  process.env.N8N_INTERNAL_API_KEY = "test-only";
  t.after(() => {
    if (before === undefined) delete process.env.N8N_INTERNAL_API_KEY;
    else process.env.N8N_INTERNAL_API_KEY = before;
    global.prismaGlobal = previousPrisma;
  });
  let saved: Record<string, unknown> = {};
  const tx = {
    chatMessage: { create: async ({ data }: { data: Record<string, unknown> }) => {
      saved = data;
      return { id: "message-test", createdAt: new Date(), ...data };
    } },
    conversation: { update: async () => ({}) },
  };
  global.prismaGlobal = {
    chatMessage: { findUnique: async () => null },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaClient;
  const { POST } = await import("./route");
  const response = await POST(new Request("http://localhost/api/internal/chat/outgoing", {
    method: "POST",
    headers: { "x-internal-api-key": "test-only", "content-type": "application/json" },
    body: JSON.stringify({ conversationId: "conversation-test", content: "Catálogo", type: "DOCUMENT", provider: "ycloud", requestId: "catalog:test", status: "failed" }),
  }));
  assert.equal(response.status, 200);
  assert.equal(saved.status, "failed");
  assert.equal(saved.messageType, "DOCUMENT");
  const metadata = saved.metadata as Record<string, unknown>;
  assert.equal(metadata.requestId, "catalog:test");
  assert.equal(metadata.errorCode, "WHATSAPP_DOCUMENT_SEND_FAILED");
  assert.match(String(metadata.error), /permisos/);
});
