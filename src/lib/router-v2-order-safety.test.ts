import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./router-v2-order-service.ts", import.meta.url),
  "utf8",
);

test("pending order creation is serialized per conversation", () => {
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /router-order:\$\{input\.conversationId\}/);
});

test("order creation and sales-state order number share one transaction", () => {
  const transaction = source.indexOf("return prisma.$transaction");
  const create = source.indexOf("tx.order.create", transaction);
  const stateUpdate = source.indexOf(
    "tx.conversationSalesState.update",
    create,
  );

  assert.ok(transaction >= 0);
  assert.ok(create > transaction);
  assert.ok(stateUpdate > create);
});
