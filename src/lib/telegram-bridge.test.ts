import test from "node:test";
import assert from "node:assert/strict";
import { controlTelegramSuperBot, sendTelegramSuperBot, telegramAuthorized, telegramReplyWindow, telegramSuperBotBridgeCompatible, telegramSuperBotBridgeReady } from "./telegram-bridge";

test("Telegram internal authentication fails closed", () => {
  const secret = "x".repeat(48);
  assert.equal(telegramAuthorized(null, secret), false);
  assert.equal(telegramAuthorized(`Bearer ${secret}`, "short"), false);
  assert.equal(telegramAuthorized(`Bearer ${secret}`, secret), true);
  assert.equal(telegramAuthorized(`Bearer ${secret}x`, secret), false);
});
test("Telegram reply window expires exactly at 24 hours", () => {
  const now = Date.now();
  assert.equal(telegramReplyWindow(null, now), false);
  assert.equal(telegramReplyWindow(new Date(now - 86400000), now), false);
  assert.equal(telegramReplyWindow(new Date(now - 86399000), now), true);
});

test("Super Bot requires an advertised bridge capability and a BOT acknowledgement", async () => {
  const previous = {
    url: process.env.TELEGRAM_BRIDGE_URL,
    secret: process.env.TELEGRAM_BRIDGE_SECRET,
    compatible: process.env.TELEGRAM_BRIDGE_SUPER_BOT_COMPATIBLE,
  };
  const originalFetch = global.fetch;
  try {
    process.env.TELEGRAM_BRIDGE_URL = "http://telegram-bridge-unit.test";
    process.env.TELEGRAM_BRIDGE_SECRET = "t".repeat(40);
    process.env.TELEGRAM_BRIDGE_SUPER_BOT_COMPATIBLE = "true";
    const sent: unknown[] = [];
    global.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/inbox/status")) return Response.json({ connected: true, capabilities: { superBotSendV1: true, superBotControlV1: true } });
      if (url.endsWith("/inbox/control")) {
        sent.push(JSON.parse(String(init?.body)));
        return Response.json({ revision: 7, sender: "BOT", protocol: "super-bot-v1" });
      }
      if (url.endsWith("/inbox/send")) {
        sent.push(JSON.parse(String(init?.body)));
        return Response.json({ messageId: 42, sender: "BOT", protocol: "super-bot-v1" });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };
    assert.equal(telegramSuperBotBridgeCompatible(), true);
    assert.equal(await telegramSuperBotBridgeReady(), true);
    await controlTelegramSuperBot({ connectionId: "connection", chatId: "123", expectedRevision: 6 });
    await sendTelegramSuperBot({ connectionId: "connection", chatId: "123", requestId: "ai:test", type: "TEXT", content: "Hola" });
    assert.deepEqual(sent, [
      { connectionId: "connection", chatId: "123", expectedRevision: 6, botEnabled: false, sender: "BOT", protocol: "super-bot-v1" },
      { connectionId: "connection", chatId: "123", requestId: "ai:test", type: "TEXT", content: "Hola", sender: "BOT", protocol: "super-bot-v1" },
    ]);
  } finally {
    global.fetch = originalFetch;
    if (previous.url === undefined) delete process.env.TELEGRAM_BRIDGE_URL; else process.env.TELEGRAM_BRIDGE_URL = previous.url;
    if (previous.secret === undefined) delete process.env.TELEGRAM_BRIDGE_SECRET; else process.env.TELEGRAM_BRIDGE_SECRET = previous.secret;
    if (previous.compatible === undefined) delete process.env.TELEGRAM_BRIDGE_SUPER_BOT_COMPATIBLE; else process.env.TELEGRAM_BRIDGE_SUPER_BOT_COMPATIBLE = previous.compatible;
  }
});

test("Super Bot remains off when the bridge does not advertise complete v1 control support", async () => {
  const previous = {
    url: process.env.TELEGRAM_BRIDGE_URL,
    secret: process.env.TELEGRAM_BRIDGE_SECRET,
    compatible: process.env.TELEGRAM_BRIDGE_SUPER_BOT_COMPATIBLE,
  };
  const originalFetch = global.fetch;
  try {
    process.env.TELEGRAM_BRIDGE_URL = "http://telegram-bridge-no-capability.test";
    process.env.TELEGRAM_BRIDGE_SECRET = "u".repeat(40);
    process.env.TELEGRAM_BRIDGE_SUPER_BOT_COMPATIBLE = "true";
    global.fetch = async () => Response.json({ connected: true, capabilities: { superBotSendV1: true } });
    assert.equal(await telegramSuperBotBridgeReady(), false);
    await assert.rejects(controlTelegramSuperBot({ connectionId: "connection", chatId: "123", expectedRevision: 0 }), /no confirma compatibilidad/i);
    await assert.rejects(sendTelegramSuperBot({ connectionId: "connection", chatId: "123", requestId: "ai:test", type: "TEXT", content: "Hola" }), /no confirma compatibilidad/i);
  } finally {
    global.fetch = originalFetch;
    if (previous.url === undefined) delete process.env.TELEGRAM_BRIDGE_URL; else process.env.TELEGRAM_BRIDGE_URL = previous.url;
    if (previous.secret === undefined) delete process.env.TELEGRAM_BRIDGE_SECRET; else process.env.TELEGRAM_BRIDGE_SECRET = previous.secret;
    if (previous.compatible === undefined) delete process.env.TELEGRAM_BRIDGE_SUPER_BOT_COMPATIBLE; else process.env.TELEGRAM_BRIDGE_SUPER_BOT_COMPATIBLE = previous.compatible;
  }
});

test("Super Bot never claims a chat from an unmarked control acknowledgement", async () => {
  const previous = {
    url: process.env.TELEGRAM_BRIDGE_URL,
    secret: process.env.TELEGRAM_BRIDGE_SECRET,
    compatible: process.env.TELEGRAM_BRIDGE_SUPER_BOT_COMPATIBLE,
  };
  const originalFetch = global.fetch;
  try {
    process.env.TELEGRAM_BRIDGE_URL = "http://telegram-bridge-bad-control.test";
    process.env.TELEGRAM_BRIDGE_SECRET = "v".repeat(40);
    process.env.TELEGRAM_BRIDGE_SUPER_BOT_COMPATIBLE = "true";
    global.fetch = async input => String(input).endsWith("/inbox/status")
      ? Response.json({ connected: true, capabilities: { superBotSendV1: true, superBotControlV1: true } })
      : Response.json({ revision: 9 });
    await assert.rejects(controlTelegramSuperBot({ connectionId: "connection", chatId: "123", expectedRevision: 0 }), /no confirmó el control/i);
  } finally {
    global.fetch = originalFetch;
    if (previous.url === undefined) delete process.env.TELEGRAM_BRIDGE_URL; else process.env.TELEGRAM_BRIDGE_URL = previous.url;
    if (previous.secret === undefined) delete process.env.TELEGRAM_BRIDGE_SECRET; else process.env.TELEGRAM_BRIDGE_SECRET = previous.secret;
    if (previous.compatible === undefined) delete process.env.TELEGRAM_BRIDGE_SUPER_BOT_COMPATIBLE; else process.env.TELEGRAM_BRIDGE_SUPER_BOT_COMPATIBLE = previous.compatible;
  }
});
