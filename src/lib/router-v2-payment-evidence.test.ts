import assert from "node:assert/strict";
import test from "node:test";
import { resolveRouterV2CheckoutFlow } from "./router-v2-checkout-flow";

test("payment requires an attached receipt and never treats an audio as verified payment", () => {
  for (const messageType of ["AUDIO", "VIDEO", "TEXT", "IMAGE", "DOCUMENT"]) {
    for (const mediaUrl of [null, "", "https://example.com/file"]) {
      const result = resolveRouterV2CheckoutFlow({ content: "ya pague", messageType, mediaUrl, state: { stage: "AWAITING_PAYMENT_CONFIRMATION", paymentData: { method: "YAPE" } } });
      const expected = Boolean(mediaUrl) && ["IMAGE", "DOCUMENT"].includes(messageType);
      assert.equal(result.step, expected ? "PAYMENT_EVIDENCE_RECEIVED" : "ASK_PAYMENT_EVIDENCE");
      assert.equal(result.createPendingOrder, false);
      if (expected) assert.deepEqual(result.patch.paymentData, { method: "YAPE", evidenceReceived: true, verified: false, evidenceUrl: mediaUrl });
      else assert.equal(result.patch.paymentData, undefined);
    }
  }
});
