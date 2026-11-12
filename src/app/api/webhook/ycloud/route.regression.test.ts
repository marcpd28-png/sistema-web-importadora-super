import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { POST } from "./route";

const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("the YCloud webhook stores inbound WhatsApp messages without enabling delivery", () => {
  assert.match(route, /whatsapp\.inbound_message\.received/);
  assert.match(route, /processIncomingMessage/);
  assert.match(route, /verifySignature/);
  assert.doesNotMatch(route, /sendYCloudOutboundMessage|api\.ycloud\.com/);
});

test("rejects an unauthenticated webhook before it can touch the inbox", async () => {
  const response = await POST(new Request("https://store.example/api/webhook/ycloud", {
    method: "POST",
    body: JSON.stringify({ type: "whatsapp.inbound_message.received" }),
  }));
  assert.equal(response.status, 401);
});
