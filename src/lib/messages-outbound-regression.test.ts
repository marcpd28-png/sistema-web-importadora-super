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

  // Verification of OUTBOX Pattern for local idempotency:
  const upsertCall = messagesService.indexOf("prisma.chatMessage.upsert(");
  const n8nCall = messagesService.indexOf("const sent = await sendN8nOutboundMessage");
  
  assert.ok(upsertCall >= 0, "Debe hacer upsert del mensaje en estado sending");
  assert.ok(n8nCall > upsertCall, "El upsert debe ser ANTES de llamar a n8n");
  
  assert.match(messagesService, /externalMessageId: sent\.messageId/);
  assert.match(messagesService, /status: "sent"/);
});

test("inbound y ManyChat conservan sus puntos de entrada actuales", () => {
  assert.match(inboundRoute, /processIncomingMessage/);
  assert.match(whatsapp, /sendQuotePdfToManychat/);
});

test("el servicio maneja los errores estructurados de n8n apropiadamente", () => {
  assert.match(messagesService, /code === 'N8N_TIMEOUT'/);
  assert.match(messagesService, /code === 'REQUEST_IN_PROGRESS'/);
  assert.match(messagesService, /code === 'REQUIRES_FORCE_RETRY'/);
  assert.match(messagesService, /isUnknown \? "unknown" : "failed"/);
});
