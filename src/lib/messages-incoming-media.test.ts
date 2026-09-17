import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import type { PrismaClient } from "@prisma/client";

const saved: Record<string, unknown>[] = [];
const contact = { id: "contact-1", externalId: "51999999999", phone: "51999999999", phoneNormalized: "51999999999", name: "Cliente", manychatSubscriberId: null };
const conversation = { id: "conversation-1", botEnabled: false, status: "ATENDIENDO", assignedUserId: null };
let incoming: typeof import("../app/api/internal/chat/incoming/route").POST;
let webhook: typeof import("../app/api/webhook/whatsapp/route").POST;

before(async () => {
  global.prismaGlobal = {
    $executeRaw: async () => 1,
    chatContact: { findUnique: async () => contact },
    conversation: { findFirst: async () => conversation, update: async () => conversation },
    chatMessage: {
      findFirst: async () => [...saved].sort((a,b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime())[0] ?? null,
      findUnique: async ({ where }: { where: { externalMessageId: string } }) => saved.find((row) => row.externalMessageId === where.externalMessageId) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `message-${saved.length}`, ...data };
        saved.push(row);
        return row;
      },
    },
    $transaction: async (queries: Promise<unknown>[] | ((tx: PrismaClient) => Promise<unknown>)) => typeof queries === "function" ? queries(global.prismaGlobal!) : Promise.all(queries),
  } as unknown as PrismaClient;
  process.env.N8N_INTERNAL_API_KEY = "test-incoming-only";
  process.env.META_APP_SECRET = "test-webhook-only";
  delete process.env.WHATSAPP_APP_SECRET;
  incoming = (await import("../app/api/internal/chat/incoming/route")).POST;
  webhook = (await import("../app/api/webhook/whatsapp/route")).POST;
});

function payload(externalMessageId: string, extra: Record<string, unknown>) {
  return { channel: "WHATSAPP", externalContactId: contact.externalId, name: contact.name, externalMessageId, timestamp: "2026-09-17T12:00:00Z", ...extra };
}

function request(body: unknown, authenticated = true) {
  return new Request("http://localhost/api/internal/chat/incoming", {
    method: "POST", headers: { "content-type": "application/json", ...(authenticated ? { "x-internal-api-key": "test-incoming-only" } : {}) }, body: JSON.stringify(body),
  });
}

test("n8n conserva el enlace del audio y permite recibirlo sin texto", async () => {
  const response = await incoming(request(payload("n8n-audio", { type: "audio", mediaUrl: "https://cdn.example.com/voice.ogg" })));
  assert.equal(response.status, 201);
  const row = saved.at(-1)!;
  assert.equal(row.messageType, "AUDIO");
  assert.equal(row.mediaUrl, "https://cdn.example.com/voice.ogg");
  assert.equal(row.content, "");
  assert.equal(row.direction, "INBOUND");
});

test("n8n conserva el sticker y no duplica el mensaje al reintentar", async () => {
  const body = payload("n8n-sticker", { type: "STICKER", mediaUrl: "https://cdn.example.com/sticker.webp" });
  assert.equal((await incoming(request(body))).status, 201);
  assert.equal(saved.at(-1)!.messageType, "STICKER");
  assert.equal(saved.at(-1)!.mediaUrl, "https://cdn.example.com/sticker.webp");
  const count = saved.length;
  const retry = await incoming(request(body));
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).duplicate, true);
  assert.equal(saved.length, count);
});

test("n8n conserva mediaId cuando WhatsApp no envía un enlace público", async () => {
  const response = await incoming(request(payload("n8n-audio-id", { type: "AUDIO", mediaId: "123456" })));
  assert.equal(response.status, 201);
  assert.deepEqual(saved.at(-1)!.metadata, { mediaId: "123456" });
});

test("el webhook firmado de Meta persiste audio y sticker con sus identificadores", async () => {
  for (const type of ["audio", "sticker"]) {
    const body = JSON.stringify({ entry: [{ changes: [{ value: {
      contacts: [{ wa_id: contact.externalId, profile: { name: contact.name } }],
      metadata: { phone_number_id: "123" },
      messages: [{ from: contact.externalId, id: `meta-${type}`, timestamp: "1789646400", type, [type]: { id: "456", mime_type: type === "audio" ? "audio/ogg" : "image/webp" } }],
    } }] }] });
    const signature = createHmac("sha256", "test-webhook-only").update(body).digest("hex");
    const response = await webhook(new NextRequest("http://localhost/api/webhook/whatsapp", {
      method: "POST", body, headers: { "x-hub-signature-256": `sha256=${signature}` },
    }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).processed, 1);
    const row = saved.at(-1)!;
    assert.equal(row.messageType, type.toUpperCase());
    assert.equal((row.metadata as { message: Record<string, { id: string }> }).message[type].id, "456");
  }
});

test("la recepción multimedia mantiene autenticación y rechaza enlaces ejecutables", async () => {
  const count = saved.length;
  assert.equal((await incoming(request(payload("bad-auth", { type: "AUDIO" }), false))).status, 401);
  assert.equal((await incoming(request(payload("bad-url", { type: "AUDIO", mediaUrl: "javascript:alert(1)" })))).status, 400);
  assert.equal(saved.length, count);
});

test("el simulador cuenta la pausa desde la recepción del servidor y mantiene el orden de mensajes", async t => {
  const now = Date.parse("2030-01-01T10:00:00Z");
  t.mock.method(Date, "now", () => now);
  const send = (id: string, content: string) => incoming(request(payload(id, {
    externalContactId: "SIMULATOR:receipt-check", timestamp: "2099-01-01T00:00:00Z", content, type: "TEXT",
  })));
  assert.equal((await send("sim-receipt-1", "hola")).status, 201);
  assert.equal((saved.at(-1)!.createdAt as Date).getTime(), now);
  assert.equal((await send("sim-receipt-2", "busco catálogo")).status, 201);
  assert.equal((saved.at(-1)!.createdAt as Date).getTime(), now + 1);
  const count = saved.length;
  assert.equal((await send("sim-receipt-2", "busco catálogo")).status, 200);
  assert.equal(saved.length, count);
});
