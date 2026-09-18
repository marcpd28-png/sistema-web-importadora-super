import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { prepareMessageImage } from "./message-upload";

test("messaging photos become a complete-frame JPEG with bounded dimensions", async () => {
  const input = await sharp({ create: { width: 2400, height: 1200, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 0.5 } } }).png().toBuffer();
  const result = await prepareMessageImage(input);
  const metadata = await sharp(result.data).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(result.width, 1920); assert.equal(result.height, 960);
  assert.equal(metadata.hasAlpha, false);
  assert(result.data.length < 5 * 1024 * 1024);
});

test("invalid image data fails before creating a messaging attachment", async () => {
  await assert.rejects(prepareMessageImage(Buffer.from("not an image")));
});
