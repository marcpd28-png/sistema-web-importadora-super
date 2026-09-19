import assert from "node:assert/strict";
import test from "node:test";
import { extractDeliveryEvents, nextDeliveryStatus } from "./message-delivery";

const receipt = { id: "wamid.test", recipient_id: "51999999999", status: "delivered", timestamp: "1789819200" };
const payload = (statuses: unknown[], phone = "123") => ({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: phone }, statuses } }] }] });
const now = new Date("2026-09-20T00:00:00Z");

test("receipts require a configured number, supported state, real provider ID and valid recipient", () => {
  const allowed = new Set(["123"]);
  assert.equal(extractDeliveryEvents(payload([receipt]), allowed, now).length, 1);
  for (const invalid of [{ ...receipt, id: "manychat-flow:fake" }, { ...receipt, status: "accepted" }, { ...receipt, recipient_id: "SIMULATOR:1" }, { ...receipt, timestamp: "9999999999" }]) {
    assert.equal(extractDeliveryEvents(payload([invalid]), allowed, now).length, 0);
  }
  assert.equal(extractDeliveryEvents(payload([receipt], "other"), allowed, now).length, 0);
});
test("receipt identities survive duplicate callbacks but distinguish state transitions", () => {
  const events = extractDeliveryEvents(payload([receipt, receipt, { ...receipt, status: "read" }]), new Set(["123"]), now);
  assert.equal(events[0].id, events[1].id);
  assert.notEqual(events[0].id, events[2].id);
});
test("out-of-order and contradictory callbacks never undo proven delivery or reading", () => {
  assert.equal(nextDeliveryStatus("read", "failed"), "read");
  assert.equal(nextDeliveryStatus("delivered", "sent"), "delivered");
  assert.equal(nextDeliveryStatus("failed", "sent"), "failed");
  assert.equal(nextDeliveryStatus("failed", "delivered"), "delivered");
  assert.equal(nextDeliveryStatus("delivered", "read"), "read");
  assert.equal(nextDeliveryStatus("pending", "failed"), "failed");
});
