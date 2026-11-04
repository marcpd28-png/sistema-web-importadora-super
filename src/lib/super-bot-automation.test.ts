import assert from "node:assert/strict";
import test from "node:test";
import { getSuperBotAutomationState } from "./super-bot-automation";

test("an explicit global activation is required; missing settings remain paused", async () => {
  assert.equal(await getSuperBotAutomationState(async () => ({ botMasterSwitch: false })), "paused");
  assert.equal(await getSuperBotAutomationState(async () => ({ botMasterSwitch: true })), "enabled");
  assert.equal(await getSuperBotAutomationState(async () => null), "paused");
});

test("an unreadable automation switch fails closed", async () => {
  assert.equal(await getSuperBotAutomationState(async () => { throw new Error("database unavailable"); }), "unavailable");
});
