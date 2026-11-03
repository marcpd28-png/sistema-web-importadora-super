import assert from "node:assert/strict";
import test from "node:test";
import { MESSENGER_SUPER_BOT_MODEL, messengerSuperBotCompatible } from "./messenger-control";

test("Messenger Super Bot requires an explicit acknowledgement and both private connections", () => {
  assert.equal(messengerSuperBotCompatible("false", "social", "control"), false);
  assert.equal(messengerSuperBotCompatible("true", "", "control"), false);
  assert.equal(messengerSuperBotCompatible("true", "social", ""), false);
  assert.equal(messengerSuperBotCompatible("true", "social", "control"), true);
  assert.equal(MESSENGER_SUPER_BOT_MODEL, "gpt-6-sol");
});
