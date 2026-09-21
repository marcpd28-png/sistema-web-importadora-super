import assert from "node:assert/strict";
import test from "node:test";
import { getBcLivePolicy, isBcLiveContact } from "./bc-live-policy";

const contact = { externalId: "customer", phoneNormalized: "51999999999" };
const base = { BC_LIVE_ENABLED: "true", BC_LIVE_SCOPE: "ALL", BC_LIVE_STARTED_AT: "2026-01-01T00:00:00Z" };
test("production scope is explicit and requires a valid activation date", () => {
  assert.equal(isBcLiveContact(contact, {}), false);
  assert.equal(isBcLiveContact(contact, { ...base, BC_LIVE_SCOPE: "" }), false);
  assert.equal(isBcLiveContact(contact, { ...base, BC_LIVE_STARTED_AT: "invalid" }), false);
  assert.equal(isBcLiveContact(contact, { ...base, BC_LIVE_STARTED_AT: "2999-01-01" }), false);
  assert.equal(isBcLiveContact(contact, base), true);
  assert.equal(getBcLivePolicy(base).testMode, true);
});
test("scope excludes simulators and malformed recipients", () => {
  assert.equal(isBcLiveContact({ ...contact, externalId: "SIMULATOR:test" }, base), false);
  assert.equal(isBcLiveContact({ phoneNormalized: "wrong" }, base), false);
  assert.equal(isBcLiveContact(contact, { ...base, BC_LIVE_SCOPE: "ALLOWLIST", BC_LIVE_PHONES: "51911111111" }), false);
  assert.equal(isBcLiveContact(contact, { ...base, BC_LIVE_SCOPE: "ALLOWLIST", BC_LIVE_PHONES: contact.phoneNormalized }), true);
});
test("legacy pilot remains limited and explicit OFF overrides it", () => {
  const pilot = { BC_LIVE_PILOT_ENABLED: "true", BC_LIVE_PILOT_PHONES: contact.phoneNormalized };
  assert.equal(isBcLiveContact(contact, pilot), true);
  assert.equal(isBcLiveContact(contact, { ...pilot, BC_LIVE_ENABLED: "false" }), false);
});
