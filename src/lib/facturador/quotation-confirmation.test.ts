import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { FacturadorClient } from "./client";
import type { FacturadorConfig } from "./types";
import { confirmQuotationResponse } from "./quotation-confirmation";

test("only an ERP number and external reference confirm registration", () => {
  for (const payload of [null, "<html>error</html>", {}, { success: true }, { success: false, data: { number_full: "COTW-1", external_id: "uuid" } }, { data: { number_full: "COTW-1" } }]) {
    assert.throws(() => confirmQuotationResponse(payload));
  }
  assert.deepEqual(confirmQuotationResponse({ success: true, data: { number_full: "COTW-1", external_id: "uuid" } }), { quoteNumber: "COTW-1", externalId: "uuid" });
});

test("quotation uses linked product, no fabricated payments, rejects false success and never retries a POST", async () => {
  let posts = 0, fail = false;
  let received: Record<string, unknown> = {};
  const server = createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url?.includes("default-customer")) return res.end(JSON.stringify({ data: { id: 1, name: "Generic" } }));
    if (req.url?.includes("customers/records")) return res.end(JSON.stringify({ data: [] }));
    if (req.url === "/api/items/record/3744") return res.end(JSON.stringify({ data: { id: 3744, internal_id: "O186", description: "Original", has_igv: true, sale_affectation_igv_type_id: "10", unit_type_id: "NIU" } }));
    if (req.method === "POST" && req.url === "/api/quotations") {
      posts++; const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk);
      received = JSON.parse(Buffer.concat(chunks).toString());
      if (fail) { res.statusCode = 500; return res.end(JSON.stringify({ message: "timeout" })); }
      return res.end(JSON.stringify({ success: false, message: "Invalid quotation" }));
    }
    res.statusCode = 404; res.end("{}");
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert(address && typeof address === "object");
  const config: FacturadorConfig = { baseUrl: `http://127.0.0.1:${address.port}/api`, token: "test", source: "test", quotationPath: "/quotations", quotationPrefix: "COTW", timeoutMs: 2000, maxRetries: 3, retryDelayMs: 1, startProductPage: 1, maxProductPages: null, productPageConcurrency: 1, productPageDelayMs: 0, hideMissingProducts: false, runningSyncTimeoutMs: 1000, productUpdatedSinceParam: null, productUpdatedSinceFormat: "iso", productWarehouseId: 1, orderByInternalId: true };
  const client = new FacturadorClient(config);
  const input = { customer: { name: "Test", phone: "000000000", address: "Lima" }, items: [{ code: "O186", externalId: "3744", name: "Original", quantity: 2, unitPrice: 155 }] };
  try {
    await assert.rejects(client.createQuotation(input), /no confirmó/);
    assert.equal(posts, 1); assert.deepEqual(received.payments, []); assert.equal(received.shipping_address, "Lima"); assert.equal(received.total, 310);
    assert.equal((received.items as Array<{item_id:number}>)[0].item_id, 3744);
    fail = true;
    await assert.rejects(client.createQuotation(input), /perdió la confirmación/);
    assert.equal(posts, 2, "a potentially committed quotation must never be replayed automatically");
  } finally { server.close(); server.closeAllConnections(); }
});
