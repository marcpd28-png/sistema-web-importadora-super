import test from "node:test";
import assert from "node:assert/strict";
import { setTikTokBridgeTyping, TikTokBridgeError } from "./tiktok-bridge";

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]; else process.env[name] = value;
}

test("TikTok typing control stays disabled until its standalone bridge is configured", async () => {
  const originalUrl = process.env.TIKTOK_BRIDGE_URL;
  const originalSecret = process.env.TIKTOK_BRIDGE_SECRET;
  const originalFetch = global.fetch;
  try {
    delete process.env.TIKTOK_BRIDGE_URL;
    delete process.env.TIKTOK_BRIDGE_SECRET;
    global.fetch = async () => { throw new Error("no debe hacer red sin configuración"); };
    assert.deepEqual(await setTikTokBridgeTyping("123", true), { configured: false, typing: false, typingUntil: null });
  } finally {
    global.fetch = originalFetch;
    restore("TIKTOK_BRIDGE_URL", originalUrl);
    restore("TIKTOK_BRIDGE_SECRET", originalSecret);
  }
});

test("TikTok typing control uses the server-only bridge secret and a bounded lease", async () => {
  const originalUrl = process.env.TIKTOK_BRIDGE_URL;
  const originalSecret = process.env.TIKTOK_BRIDGE_SECRET;
  const originalFetch = global.fetch;
  try {
    process.env.TIKTOK_BRIDGE_URL = "http://127.0.0.1:13125";
    process.env.TIKTOK_BRIDGE_SECRET = "x".repeat(32);
    let request: Request | undefined;
    global.fetch = async (input, init) => {
      request = new Request(input, init);
      return Response.json({ typing: true, typingUntil: 12345 });
    };
    assert.deepEqual(await setTikTokBridgeTyping("123", true), { configured: true, typing: true, typingUntil: 12345 });
    assert.equal(request!.url, "http://127.0.0.1:13125/typing");
    assert.equal(request!.headers.get("x-tiktok-bridge-key"), "x".repeat(32));
    assert.deepEqual(await request!.json(), { conversationId: "123", typing: true, leaseSeconds: 8 });
    await assert.rejects(setTikTokBridgeTyping("../123", true), error => error instanceof TikTokBridgeError && error.statusCode === 400);
  } finally {
    global.fetch = originalFetch;
    restore("TIKTOK_BRIDGE_URL", originalUrl);
    restore("TIKTOK_BRIDGE_SECRET", originalSecret);
  }
});
