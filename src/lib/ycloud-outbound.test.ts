import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  normalizeYCloudPhone,
  sendYCloudOutboundMessage,
  YCloudOutboundError,
} from "./ycloud-outbound";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.YCLOUD_API_KEY;
const originalFrom = process.env.YCLOUD_WHATSAPP_FROM;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.YCLOUD_API_KEY;
  else process.env.YCLOUD_API_KEY = originalApiKey;
  if (originalFrom === undefined) delete process.env.YCLOUD_WHATSAPP_FROM;
  else process.env.YCLOUD_WHATSAPP_FROM = originalFrom;
});

test("normaliza emisor y destinatario al formato E.164 requerido por YCloud", async () => {
  process.env.YCLOUD_API_KEY = "test-key";
  process.env.YCLOUD_WHATSAPP_FROM = "51 955 252 609";
  let requestBody = "";
  globalThis.fetch = async (_input, init) => {
    requestBody = String(init?.body);
    return new Response(JSON.stringify({ id: "ycloud-message-1" }), { status: 200 });
  };

  const result = await sendYCloudOutboundMessage({
    content: "Hola",
    recipient: "51967426958",
    type: "text",
    externalId: "local-persisted-message-id",
  });

  const payload = JSON.parse(requestBody) as Record<string, unknown>;
  assert.equal(payload.from, "+51955252609");
  assert.equal(payload.to, "+51967426958");
  assert.equal(payload.externalId, "local-persisted-message-id");
  assert.equal(result.provider, "ycloud");
});

test("rechaza números que no pueden convertirse a E.164", async () => {
  process.env.YCLOUD_API_KEY = "test-key";
  process.env.YCLOUD_WHATSAPP_FROM = "+51955252609";

  await assert.rejects(
    sendYCloudOutboundMessage({ content: "Hola", recipient: "310", type: "text" }),
    (error: unknown) => error instanceof YCloudOutboundError && error.code === "INVALID_RECIPIENT",
  );
});

test("detecta una configuración incompleta", async () => {
  delete process.env.YCLOUD_API_KEY;
  delete process.env.YCLOUD_WHATSAPP_FROM;

  await assert.rejects(
    sendYCloudOutboundMessage({ content: "Hola", recipient: "51967426958", type: "text" }),
    (error: unknown) => error instanceof YCloudOutboundError && error.code === "YCLOUD_CONFIGURATION_MISSING",
  );
});

test("conserva el mensaje seguro devuelto por YCloud", async () => {
  process.env.YCLOUD_API_KEY = "test-key";
  process.env.YCLOUD_WHATSAPP_FROM = "+51955252609";
  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: { message: "Outside the 24-hour customer service window" } }),
    { status: 400 },
  );

  await assert.rejects(
    sendYCloudOutboundMessage({ content: "Hola", recipient: "51967426958", type: "text" }),
    (error: unknown) => error instanceof YCloudOutboundError
      && error.code === "YCLOUD_REJECTED"
      && error.message.includes("24-hour"),
  );
});

test("normalizador acepta formato internacional y rechaza entradas incompletas", () => {
  assert.equal(normalizeYCloudPhone("+51 967 426 958"), "+51967426958");
  assert.equal(normalizeYCloudPhone("310"), null);
});
