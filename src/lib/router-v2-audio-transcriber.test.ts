import assert from "node:assert/strict";
import test from "node:test";

import { parseRouterV2AudioDataUrl } from "@/lib/router-v2-audio-transcriber";

test("audio parser accepts base64 WhatsApp-style audio data", () => {
  const parsed = parseRouterV2AudioDataUrl(
    "data:audio/ogg;base64,SGVsbG8=",
  );

  assert.ok(parsed);
  assert.equal(parsed.mimeType, "audio/ogg");
  assert.equal(parsed.extension, "ogg");
  assert.equal(Buffer.from(parsed.bytes).toString("utf8"), "Hello");
});

test("audio parser rejects non-audio or malformed data urls", () => {
  assert.equal(
    parseRouterV2AudioDataUrl("data:image/png;base64,SGVsbG8="),
    null,
  );
  assert.equal(parseRouterV2AudioDataUrl("https://example.test/a.ogg"), null);
  assert.equal(parseRouterV2AudioDataUrl("data:audio/ogg;base64,"), null);
});
