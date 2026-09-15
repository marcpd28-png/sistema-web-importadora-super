import { test } from "node:test";
import assert from "node:assert/strict";
import { hasSubscribedMetaApp } from "./meta-review-checks";

test("another subscribed provider does not verify our application", () => {
  assert.equal(hasSubscribedMetaApp({ data: [{ whatsapp_business_api_data: { id: "manychat" } }] }, "ours"), false);
});
test("the exact Meta application must be subscribed", () => {
  assert.equal(hasSubscribedMetaApp({ data: [{ whatsapp_business_api_data: { id: "ours" } }] }, "ours"), true);
});
test("missing app configuration and malformed responses fail closed", () => {
  for (const data of [null, {}, { data: null }, { data: [null, {}, "ours"] }]) {
    assert.equal(hasSubscribedMetaApp(data, "ours"), false);
  }
  assert.equal(hasSubscribedMetaApp({ data: [{ whatsapp_business_api_data: { id: "ours" } }] }, undefined), false);
});
