import assert from "node:assert/strict";
import { test } from "node:test";
import { incomingMessageSchema, sendInternalMessage } from "./messages-service";
import { prisma } from "./prisma";
import { YCloudOutboundError } from "./ycloud-outbound";
import { ConversationAssignmentError } from "./conversation-assignment";

test("rechaza citas ajenas o sin identificador WhatsApp antes de guardar o enviar", async (t) => {
  const originalConversationLookup = prisma.conversation.findUnique;
  const originalMessageLookup = prisma.chatMessage.findFirst;
  const originalTransaction = prisma.$transaction;
  t.after(() => {
    prisma.conversation.findUnique = originalConversationLookup;
    prisma.chatMessage.findFirst = originalMessageLookup;
    prisma.$transaction = originalTransaction;
  });
  prisma.conversation.findUnique = t.mock.fn(async () => ({ id: "conversation-1", contact: {} })) as unknown as typeof prisma.conversation.findUnique;
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

test("un asesor no puede enviar si el chat fue derivado antes de crear el mensaje", async (t) => {
  const originalConversationLookup = prisma.conversation.findUnique;
  const originalTransaction = prisma.$transaction;

  t.after(() => {
    prisma.conversation.findUnique = originalConversationLookup;
    prisma.$transaction = originalTransaction;
  });

  prisma.conversation.findUnique = t.mock.fn(async () => ({
    id: "conversation-1",
    channel: "WEB",
    contact: { phone: "+51967426958" },
  })) as unknown as typeof prisma.conversation.findUnique;

  const createPending = t.mock.fn(async () => ({ createdAt: new Date() }));
  const verifyOwnership = t.mock.fn(async () => ({ count: 0 }));
  const transaction = {
    chatMessage: {
      create: createPending,
    },
    conversation: {
      updateMany: verifyOwnership,
      update: async () => ({}),
    },
  };
  prisma.$transaction = (async (work: (tx: typeof transaction) => Promise<unknown>) => work(transaction)) as unknown as typeof prisma.$transaction;

  await assert.rejects(
    sendInternalMessage(
      "conversation-1",
      {
        content: "Respuesta",
        type: "TEXT",
        requestId: "421d2aa2-a43e-4f55-aefb-11f3b9d26497",
      },
      "advisor-1",
      { expectedAssigneeId: "advisor-1" },
    ),
    (error: unknown) => error instanceof ConversationAssignmentError && error.statusCode === 404,
  );

  assert.equal(verifyOwnership.mock.callCount(), 1);
  assert.equal(createPending.mock.callCount(), 0);
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
