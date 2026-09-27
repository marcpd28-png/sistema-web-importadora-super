import test from "node:test";
import assert from "node:assert/strict";
import { detectPlan } from "./planning";
import { memorySchema } from "./contracts";

test("real conversation: technical Bluetooth follow-up keeps selected product", () => {
  const plan = detectPlan("tiene bluetooth?", memorySchema.parse({ productCodes: ["ACE-001"] }));
  assert.equal(plan.intent, "PRODUCT_DETAILS");
  assert.deepEqual(plan.codes, ["ACE-001"]);
});
test("real conversation: diferencia con compares new code against active product", () => {
  const plan = detectPlan("cuál es la diferencia con ATU-110?", memorySchema.parse({ productCodes: ["ACE-001"] }));
  assert.equal(plan.intent, "PRODUCT_COMPARISON");
  assert.deepEqual(plan.codes, ["ACE-001", "ATU-110"]);
});
