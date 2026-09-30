import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { prepareWhatsAppUpload } from "./whatsapp-upload";
import { parseHttpByteRange } from "./http-byte-range";

test("chat image uploads become small RGB JPEG files, not WebP storefront variants", async () => {
  const source = await sharp({ create: { width: 50, height: 50, channels: 4, background: "red" } }).webp().toBuffer();
  const prepared = await prepareWhatsAppUpload(source, "image/webp");
  assert.equal(prepared.extension, ".jpg");
  assert.equal((await sharp(prepared.buffer).metadata()).format, "jpeg");
});
test("unsupported audio/video formats and oversized files fail before sending", async () => {
  await assert.rejects(prepareWhatsAppUpload(Buffer.from("test"), "audio/wav"), /requiere/);
  await assert.rejects(prepareWhatsAppUpload(Buffer.from("test"), "video/quicktime"), /requiere/);
  await assert.rejects(prepareWhatsAppUpload(Buffer.alloc(17 * 1024 * 1024), "video/mp4"), /límite/);
  await assert.rejects(prepareWhatsAppUpload(Buffer.from("OggS-no-opus"), "audio/ogg"), /Opus/);
});
test("audio/video supports bounded, suffix and open byte ranges", () => {
  assert.deepEqual(parseHttpByteRange("bytes=0-9", 100), { start: 0, end: 9 });
  assert.deepEqual(parseHttpByteRange("bytes=-10", 100), { start: 90, end: 99 });
  assert.deepEqual(parseHttpByteRange("bytes=90-", 100), { start: 90, end: 99 });
  for (const invalid of ["bytes=100-", "bytes=-0", "bytes=10-2", "bytes=1-2,4-5", "bytes=-"]) assert.equal(parseHttpByteRange(invalid, 100), "invalid");
});
