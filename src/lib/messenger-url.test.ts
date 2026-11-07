import assert from "node:assert/strict";
import test from "node:test";
import { buildMessengerReferral, buildMessengerReferralUrl } from "./messenger-url";

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

test("reports when an invalid configuration required the safe official fallback", () => {
  const referral = buildMessengerReferral("https://example.invalid/not-messenger", "cotizacion-1");
  assert.equal(referral.usedFallback, true);
  assert.match(referral.href, /^https:\/\/m\.me\/importacionessuperoficial\?ref=/);
});
