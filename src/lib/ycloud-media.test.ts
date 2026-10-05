import assert from "node:assert/strict";
import test from "node:test";
import { ycloudMediaKind } from "./ycloud-media";

test("recognizes authenticated API media separately from signed CDN links", () => {
  assert.equal(ycloudMediaKind("https://api.ycloud.com/v2/whatsapp/media/123"), "api");
  assert.equal(ycloudMediaKind("https://static-internal.ycloud.com/yunpian/attila/inbox/message/123/doc.pdf?Expires=123&Signature=test"), "cdn");
});

test("rejects non-provider destinations and credentials or nonstandard ports", () => {
  for (const url of [null, "/local.pdf", "http://api.ycloud.com/v2/file", "https://api.ycloud.com.evil.invalid/v2/file", "https://localhost/v2/file", "https://user:secret@api.ycloud.com/v2/file", "https://api.ycloud.com:8443/v2/file", "https://static-internal.ycloud.com/other/file", "https://api.ycloud.com/other"]) {
    assert.equal(ycloudMediaKind(url), null);
  }
});
