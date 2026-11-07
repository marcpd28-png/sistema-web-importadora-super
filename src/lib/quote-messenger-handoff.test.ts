import assert from "node:assert/strict";
import test from "node:test";
import { buildQuoteMessengerHandoff } from "./quote-messenger-handoff";

test("reuses a pending quote with a Messenger handoff instead of rejecting the retry", () => {
  const result = buildQuoteMessengerHandoff({
    id: "request-1", status: "PENDING", quoteNumber: null, erpExternalId: null,
    contactHref: null, statusSteps: null,
  }, "https://m.me/importacionessuperoficial?ref=cotizacion-request-1");
  assert.equal(result.reused, true);
  assert.equal(result.messengerHref, "https://m.me/importacionessuperoficial?ref=cotizacion-request-1");
  assert.match(result.message, /no se duplicará/i);
});

test("keeps a locally created quote actionable when ERP registration needs review", () => {
  const result = buildQuoteMessengerHandoff({
    id: "request-review", status: "IN_REVIEW", quoteNumber: null, erpExternalId: null,
    contactHref: null, statusSteps: [{ status: "warning" }],
  }, "https://m.me/importacionessuperoficial?ref=q.request-review.signature");
  assert.equal(result.reused, true);
  assert.match(result.message, /pendiente de confirmación/i);
});

test("keeps the ERP reference when a registered quote is retried", () => {
  const result = buildQuoteMessengerHandoff({
    id: "request-2", status: "ERP_REGISTERED", quoteNumber: "COT-42", erpExternalId: "erp-42",
    contactHref: "https://m.me/importacionessuperoficial?ref=cotizacion-COT-42", statusSteps: [],
  }, "https://m.me/importacionessuperoficial?ref=cotizacion-COT-42");
  assert.equal(result.quoteNumber, "COT-42");
  assert.match(result.message, /registrada en el ERP/i);
});
