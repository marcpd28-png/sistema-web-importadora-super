import assert from "node:assert/strict";
import { test } from "node:test";
import { incomingMessageSchema, sendInternalMessage } from "./messages-service";
import { prisma } from "./prisma";
import { YCloudOutboundError } from "./ycloud-outbound";

test("rechaza citas ajenas o sin identificador WhatsApp antes de guardar o enviar", async (t) => {
  const originalConversationLookup = prisma.conversation.findUnique;
  const originalMessageLookup = prisma.chatMessage.findFirst;
  const originalRequestLookup = prisma.chatMessage.findUnique;
  const originalTransaction = prisma.$transaction;
  t.after(() => {
    prisma.conversation.findUnique = originalConversationLookup;
    prisma.chatMessage.findFirst = originalMessageLookup;
    prisma.chatMessage.findUnique = originalRequestLookup;
    prisma.$transaction = originalTransaction;
  });
  prisma.conversation.findUnique = t.mock.fn(async () => ({ id: "conversation-1", contact: {} })) as unknown as typeof prisma.conversation.findUnique;
  prisma.chatMessage.findUnique = t.mock.fn(async () => null) as unknown as typeof prisma.chatMessage.findUnique;
  let result: { externalMessageId: string } | null = null;
  const lookup = t.mock.fn(async (...args: unknown[]) => { void args; return result; });
  prisma.chatMessage.findFirst = lookup as unknown as typeof prisma.chatMessage.findFirst;
  const transaction = t.mock.fn(async () => { throw new Error("No debe guardar"); });
  prisma.$transaction = transaction as typeof prisma.$transaction;
  for (const target of [null, { externalMessageId: "ycloud-id" }]) {
    result = target;
    await assert.rejects(sendInternalMessage("conversation-1", {
      content: "Respuesta", type: "TEXT", requestId: "decd5efb-ea19-4a31-b4c4-63441b654d20", replyToMessageId: "target-1",
    }, "agent-1"), (error: unknown) => error instanceof YCloudOutboundError && error.code === "INVALID_REPLY_TARGET");
  }
  assert.deepEqual(lookup.mock.calls[0].arguments, [{ where: { id: "target-1", conversationId: "conversation-1", senderType: "CUSTOMER" } }]);
  assert.equal(transaction.mock.callCount(), 0);
});

test("un reintento con el mismo requestId no llama a YCloud otra vez", async (t) => {
  const originalConversationLookup = prisma.conversation.findUnique;
  const originalRequestLookup = prisma.chatMessage.findUnique;
  const originalTransaction = prisma.$transaction;
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.YCLOUD_API_KEY;
  const originalFrom = process.env.YCLOUD_WHATSAPP_FROM;
  const messages = new Map<string, Record<string, unknown>>();

  t.after(() => {
    prisma.conversation.findUnique = originalConversationLookup;
    prisma.chatMessage.findUnique = originalRequestLookup;
    prisma.$transaction = originalTransaction;
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.YCLOUD_API_KEY;
    else process.env.YCLOUD_API_KEY = originalApiKey;
    if (originalFrom === undefined) delete process.env.YCLOUD_WHATSAPP_FROM;
    else process.env.YCLOUD_WHATSAPP_FROM = originalFrom;
  });

  prisma.conversation.findUnique = t.mock.fn(async () => ({
    id: "conversation-1",
    // This branch intentionally avoids the WhatsApp/Telegram Rocky pause so
    // the test isolates the durable request-id idempotency behavior.
    channel: "MESSENGER",
    contact: { phone: "+51967426958", phoneNormalized: null, externalId: null },
  })) as unknown as typeof prisma.conversation.findUnique;
  prisma.chatMessage.findUnique = t.mock.fn(async (args: { where: { id: string } }) => messages.get(args.where.id) ?? null) as unknown as typeof prisma.chatMessage.findUnique;

  const transaction = {
    $executeRaw: async () => 0,
    chatMessage: {
      findUnique: async (args: { where: { id: string } }) => messages.get(args.where.id) ?? null,
      create: async (args: { data: Record<string, unknown> }) => {
        const row: Record<string, unknown> = {
          ...args.data,
          createdAt: new Date(),
          externalMessageId: null,
        };
        messages.set(String(args.data.id), row);
        return row;
      },
      updateMany: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = messages.get(args.where.id);
        if (!row) return { count: 0 };
        messages.set(args.where.id, { ...row, ...args.data });
        return { count: 1 };
      },
      findUniqueOrThrow: async (args: { where: { id: string } }) => messages.get(args.where.id),
    },
    conversation: { update: async () => ({}) },
  };
  prisma.$transaction = (async (work: (tx: typeof transaction) => Promise<unknown>) => work(transaction)) as unknown as typeof prisma.$transaction;

  process.env.YCLOUD_API_KEY = "test-key";
  process.env.YCLOUD_WHATSAPP_FROM = "+15005550007";
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls++;
    return Response.json({ id: "provider-message" });
  };

  const requestId = "9ed840db-cfbd-4bc7-8c22-1fffae5bced2";
  const input = { content: "si es compatible", type: "TEXT" as const, requestId };
  const first = await sendInternalMessage("conversation-1", input, "agent-1");
  const retry = await sendInternalMessage("conversation-1", input, "agent-1");

  assert.equal(providerCalls, 1);
  assert.equal(messages.size, 1);
  assert.equal(first.id, `waout:${requestId}`);
  assert.equal(retry.id, first.id);
});

test("acepta mensajes entrantes sin un identificador de proveedor heredado", () => {
  const parsed = incomingMessageSchema.parse({
    channel: "WHATSAPP",
    externalContactId: "51967426958",
    name: "Cliente WhatsApp",
    externalMessageId: "wamid.test",
    content: "hola",
    timestamp: "2026-09-16T01:00:00.000Z",
  });

  assert.equal(parsed.externalContactId, "51967426958");
});
