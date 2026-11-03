import assert from "node:assert/strict";
import test from "node:test";
import { MESSENGER_SUPER_BOT_MODEL, messengerControlClaimableBySuperBot, messengerSuperBotAllowsStoreUnmanaged, messengerSuperBotCompatible, type MessengerControlState } from "./messenger-control";

test("Messenger Super Bot requires an explicit acknowledgement and both private connections", () => {
  assert.equal(messengerSuperBotCompatible("false", "social", "control"), false);
  assert.equal(messengerSuperBotCompatible("true", "", "control"), false);
  assert.equal(messengerSuperBotCompatible("true", "social", ""), false);
  assert.equal(messengerSuperBotCompatible("true", "social", "control"), true);
  assert.equal(MESSENGER_SUPER_BOT_MODEL, "gpt-6-sol");
});

test("store/unmanaged Messenger control needs its own opt-in and remains fail-closed", () => {
  const unmanaged: MessengerControlState = {
    owner: "store", botEnabled: true, mode: "unmanaged", resumeAt: null,
    resumeTarget: null, error: null, metaAiAvailable: true, ownerVerified: true,
  };
  assert.equal(messengerSuperBotAllowsStoreUnmanaged("false"), false);
  assert.equal(messengerSuperBotAllowsStoreUnmanaged("true"), true);
  assert.equal(messengerControlClaimableBySuperBot(unmanaged, false), false);
  assert.equal(messengerControlClaimableBySuperBot(unmanaged, true), true);
  assert.equal(messengerControlClaimableBySuperBot({ ...unmanaged, owner: "meta", mode: "meta", ownerVerified: undefined }, true), false);
  assert.equal(messengerControlClaimableBySuperBot({ ...unmanaged, resumeAt: Date.now() + 1 }, true), false);
  assert.equal(messengerControlClaimableBySuperBot({ ...unmanaged, ownerVerified: undefined }, true), false);
  assert.equal(messengerControlClaimableBySuperBot({ ...unmanaged, ownerVerified: false }, true), false);
  assert.equal(messengerControlClaimableBySuperBot({ ...unmanaged, error: "controller_error" }, true), false);
});
