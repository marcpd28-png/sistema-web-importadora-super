import test from "node:test";
import assert from "node:assert/strict";
import { messageStatusLabel } from "./message-status-label";

test("flow acceptance and acknowledgement never claim WhatsApp delivery", () => {
  assert.equal(messageStatusLabel("sent", {}), "Aceptado; entrega no confirmada.");
  assert.equal(messageStatusLabel("sent", { manychatImageFlowAck: {} }), "Flujo procesado; entrega no confirmada.");
  assert.equal(messageStatusLabel("failed", { manychatImageDispatch: "uncertain" }), "Sin confirmar. Requiere revisión; no se reenviará automáticamente.");
  assert.equal(messageStatusLabel("read", { manychatImageFlowAck: {} }), "Leído");
});
