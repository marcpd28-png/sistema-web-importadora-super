import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const messagesService = readFileSync(new URL("./messages-service.ts", import.meta.url), "utf8");
const outbound = readFileSync(new URL("./ycloud-outbound.ts", import.meta.url), "utf8");
const whatsapp = readFileSync(new URL("./whatsapp.ts", import.meta.url), "utf8");

test("los envíos manuales y de utilidades usan YCloud", () => {
  assert.match(messagesService, /sendYCloudOutboundMessage/);
  assert.match(whatsapp, /sendYCloudOutboundMessage/);
  assert.match(outbound, /https:\/\/api\.ycloud\.com\/v2\/whatsapp\/messages/);
});

test("los contactos del simulador nunca se relacionan por un teléfono inferido", () => {
  assert.match(messagesService, /const isSimulator = parsed\.externalContactId\.startsWith\("SIMULATOR:"\)/);
  assert.match(messagesService, /if \(!contact && normalizedPhone && !isSimulator\)/);
});
