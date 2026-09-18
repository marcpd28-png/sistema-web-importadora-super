import assert from "node:assert/strict";
import test from "node:test";
import { simulatorInputSchema, simulatorWebhookMessage, SIMULATOR_MEDIA_MAX_BYTES } from "./simulator-message";
import { getMessageMedia } from "./message-media";

test("text and captioned media survive simulator validation, webhook and inbox decoding", () => {
  const identity = { from: "SIMULATOR:abc", id: "SIM-CUSTOMER:1", timestamp: "1" };
  for (const [type, mime] of [["IMAGE", "image/png"], ["AUDIO", "audio/ogg"]] as const) {
    const dataUrl = `data:${mime};base64,YWJj`;
    const parsed = simulatorInputSchema.parse({ content: "cuanto por dos", attachment: { type, dataUrl } });
    const webhook = simulatorWebhookMessage(parsed, identity);
    assert.equal(webhook.type, type.toLowerCase());
    assert.deepEqual(webhook[type.toLowerCase()], { link: dataUrl, caption: "cuanto por dos" });
    const media = getMessageMedia({ messageType: type, mediaUrl: dataUrl });
    assert.equal(media.type, type);
    assert.equal(media.url, dataUrl);
    assert.equal(simulatorInputSchema.safeParse({ attachment: { type, dataUrl } }).success, true);
  }
  assert.equal(simulatorWebhookMessage(simulatorInputSchema.parse({ content: "hola" }), identity).type, "text");
});

test("rejects empty messages, remote downloads, executable files, mismatches and oversized media", () => {
  assert.equal(simulatorInputSchema.safeParse({}).success, false);
  for (const dataUrl of ["https://example.com/photo.png", "data:image/svg+xml;base64,YWJj", "data:text/html;base64,YWJj", "data:audio/ogg;base64,YWJj", "data:image/png;base64,!!", "data:image/png;base64,YQ", `data:image/png;base64,${Buffer.alloc(SIMULATOR_MEDIA_MAX_BYTES + 1).toString("base64")}`]) {
    assert.equal(simulatorInputSchema.safeParse({ attachment: { type: "IMAGE", dataUrl } }).success, false);
  }
});
