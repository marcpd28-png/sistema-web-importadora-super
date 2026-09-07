import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const messagesService = readFileSync(
  new URL("./messages-service.ts", import.meta.url),
  "utf8",
);
const inboundRoute = readFileSync(
  new URL("../app/api/internal/chat/incoming/route.ts", import.meta.url),
  "utf8",
);
const whatsapp = readFileSync(new URL("./whatsapp.ts", import.meta.url), "utf8");

test("el envío manual usa n8n y no llama directamente a Meta", () => {
  assert.match(messagesService, /sendN8nOutboundMessage/);
  assert.doesNotMatch(messagesService, /sendWhatsapp(Text|Media)Message/);

  const n8nCall = messagesService.indexOf("const sent = await sendN8nOutboundMessage");
  const transaction = messagesService.indexOf("return prisma.$transaction", n8nCall);
  assert.ok(n8nCall >= 0 && transaction > n8nCall);
  assert.match(messagesService, /externalMessageId: sent\.messageId/);
  assert.match(messagesService, /status: "sent"/);
});

test("inbound y ManyChat conservan sus puntos de entrada actuales", () => {
  assert.match(inboundRoute, /processIncomingMessage/);
  assert.match(whatsapp, /sendQuotePdfToManychat/);
});
