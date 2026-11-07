import assert from "node:assert/strict";
import test from "node:test";
import { createQuoteMessengerReference, verifyQuoteMessengerReference } from "./quote-messenger-reference";

test("signs a quote reference for a future Messenger adapter", () => {
  const original = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "test-quote-handoff-secret";
  try {
    const reference = createQuoteMessengerReference("123e4567-e89b-42d3-a456-426614174000");
    assert.equal(verifyQuoteMessengerReference(reference), "123e4567-e89b-42d3-a456-426614174000");
    assert.equal(verifyQuoteMessengerReference(`${reference}x`), null);
  } finally {
    if (original === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = original;
  }
});
