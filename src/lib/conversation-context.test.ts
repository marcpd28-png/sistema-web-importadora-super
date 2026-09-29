import assert from "node:assert/strict";
import test from "node:test";
import { buildAutomationConversationContext } from "./conversation-context";

test("combina mensajes consecutivos del cliente para la automatización", () => {
  const context = buildAutomationConversationContext([
    { id: "message-1", content: "Catálogo", createdAt: new Date("2026-09-29T04:08:00.000Z") },
    { id: "message-2", content: "Vengo de TikTok", createdAt: new Date("2026-09-29T04:08:03.000Z") },
  ]);

  assert.equal(context.combinedContent, "Catálogo\nVengo de TikTok");
  assert.deepEqual(context.messageHistory.map((message) => message.content), ["Catálogo", "Vengo de TikTok"]);
});
