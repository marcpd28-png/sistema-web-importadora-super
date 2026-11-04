import assert from "node:assert/strict";
import test from "node:test";
import { buildMessengerReferralUrl } from "./messenger-url";

test("builds a referral from the configured Messenger URL", () => {
  assert.equal(
    buildMessengerReferralUrl("https://m.me/mi-tienda?origin=web", "pedido-ORD-00001"),
    "https://m.me/mi-tienda?origin=web&ref=pedido-ORD-00001",
  );
});

test("uses the safe public fallback for an invalid configured URL", () => {
  assert.equal(
    buildMessengerReferralUrl("not-a-url", "cotizacion-1"),
    "https://m.me/importacionessuperoficial?ref=cotizacion-1",
  );
});
