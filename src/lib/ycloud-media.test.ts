import assert from "node:assert/strict";
import test from "node:test";
import { ycloudMediaKind } from "./ycloud-media";

test("only recognizes the two trusted YCloud media origins", () => {
  assert.equal(ycloudMediaKind("https://api.ycloud.com/v2/whatsapp/media/123"), "api");
  assert.equal(
    ycloudMediaKind("https://static-internal.ycloud.com/yunpian/attila/inbox/message/123/file.pdf?Signature=test"),
    "cdn",
  );
});

test("rejects untrusted or credential-bearing media URLs", () => {
  for (const url of [
    null,
    "/local.pdf",
    "http://api.ycloud.com/v2/file",
    "https://api.ycloud.com.evil.invalid/v2/file",
    "https://user:secret@api.ycloud.com/v2/file",
    "https://api.ycloud.com:8443/v2/file",
    "https://static-internal.ycloud.com/other/file",
  ]) {
    assert.equal(ycloudMediaKind(url), null);
  }
});
