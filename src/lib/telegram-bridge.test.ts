import test from "node:test";
import assert from "node:assert/strict";
import { telegramAuthorized, telegramReplyWindow } from "./telegram-bridge";

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
