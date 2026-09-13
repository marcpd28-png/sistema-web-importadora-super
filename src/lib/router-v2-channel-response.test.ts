import assert from "node:assert/strict";
import test from "node:test";

import { splitRouterV2WhatsappText } from "@/lib/router-v2-channel-response";

test("keeps short WhatsApp replies in one message", () => {
  assert.deepEqual(splitRouterV2WhatsappText("Respuesta breve"), [
    "Respuesta breve",
  ]);
});

test("splits long WhatsApp replies without exceeding the safe limit", () => {
  const text = `${"Producto disponible. ".repeat(180)}\n\n${"Detalle técnico. ".repeat(180)}`;
  const chunks = splitRouterV2WhatsappText(text, 500);

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 500));
  assert.equal(chunks.join(" ").replace(/\s+/g, " ").trim(), text.replace(/\s+/g, " ").trim());
});

test("never emits an empty message", () => {
  assert.deepEqual(splitRouterV2WhatsappText("   "), []);
});
