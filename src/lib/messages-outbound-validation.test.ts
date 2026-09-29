import assert from "node:assert/strict";
import { test } from "node:test";
import { incomingMessageSchema } from "./messages-service";

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
