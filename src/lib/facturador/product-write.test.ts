import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { FacturadorApiError } from "./client";
import { buildProductWrite, productRevision, productSnapshot, verifyProductChanges } from "./product-payload";
import { erpProductSendSchema, type ErpProductOperation } from "./product-fields";
import { sendErpProduct } from "./product-write";

const original = {
  id: 3744, internal_id: "O186", description: "Cargador", name: "Descripción", second_name: null,
  image_url: "https://erp.example/storage/uploads/items/original.jpg", category_id: 4,
  unit_type_id: "NIU", currency_type_id: "PEN", sale_unit_price: 145, purchase_unit_price: 124,
  sale_affectation_igv_type_id: "10", purchase_affectation_igv_type_id: "10", has_igv: true,
  stock: 60, item_unit_types: [{ price2: 155 }],
};
const identity = { externalId: "3744", code: "O186" };
test("product update preserves original image/prices and excludes stock and presentations", () => {
  const { path, body } = buildProductWrite(original, identity, { kind: "product", changes: { internal_id: "NEW", description: "Nuevo nombre", name: "Detalle" } });
  assert.equal(path, "/items/update"); assert.equal(body.id, 3744);
  assert.equal(body.internal_id, "NEW"); assert.equal(body.description, "Nuevo nombre");
  assert.equal(body.image, "original.jpg"); assert.equal(body.temp_path, null);
  assert.equal(body.purchase_unit_price, 124); assert.equal(body.sale_unit_price, 145);
  assert.ok(!("stock" in body)); assert.ok(!("item_unit_types" in body));
  assert.ok(!("name_long" in body)); assert.ok(!("factory_code" in body));
});
test("only documented fields are accepted; monetary values and flags are validated", () => {
  for (const changes of [{ stock: 100 }, { id: 7 }, { sale_unit_price: "" }, { sale_unit_price: -1 }, { has_igv: "false" }, { percentage_isc: 101 }, {}]) {
    assert.equal(erpProductSendSchema.safeParse({ kind: "product", changes }).success, false);
  }
  assert.equal(erpProductSendSchema.safeParse({ kind: "inventory", type: "output", quantity: 0, warehouseId: 1 }).success, false);
  assert.equal(erpProductSendSchema.safeParse({ kind: "inventory", type: "input", quantity: 1, warehouseId: 1.5 }).success, false);
});
test("stock uses the documented movement contract with ERP code and explicit warehouse", () => {
  for (const type of ["input", "output"] as const) {
    const result = buildProductWrite(original, identity, { kind: "inventory", type, quantity: 3, warehouseId: 2 });
    assert.equal(result.path, "/inventory/transaction");
    assert.deepEqual(result.body, { type, inventory_transaction_id: type === "input" ? "03" : "01", item_code: "O186", quantity: 3, warehouse_id: 2 });
  }
});
test("image references are restricted to the ERP and rich content is escaped", () => {
  const good = buildProductWrite(original, identity, { kind: "product", changes: { image_url: "https://erp.example/storage/uploads/items/new.png", name_long: "<script>bad()</script>\nTexto" } });
  assert.equal(good.body.image, "new.png"); assert.match(String(good.body.name_long), /&lt;script&gt;/);
  for (const image_url of ["https://other.example/a.jpg", "https://erp.example/a.jpg", "https://erp.example/storage/uploads/items/a%2Fb.jpg", "https://erp.example/storage/uploads/items/a.jpg?x=1"]) {
    assert.throws(() => buildProductWrite(original, identity, { kind: "product", changes: { image_url } }), /imagen/);
  }
  assert.throws(() => buildProductWrite(original, { ...identity, code: "OTHER" }, { kind: "inventory", type: "input", quantity: 1, warehouseId: 1 }), /código/);
});
test("snapshot exposes allowed fields only and verification distinguishes missing from mismatched", () => {
  const snapshot = productSnapshot({ ...original, secret: "hidden" }, { data: { warehouses: [{ id: 1, description: "Principal", secret: "hidden" }] } });
  assert.equal(snapshot.values.secret, undefined); assert.deepEqual(snapshot.tables.warehouses, [{ id: "1", label: "Principal" }]);
  assert.notEqual(productRevision(original), productRevision({ ...original, sale_unit_price: 999 }));
  assert.deepEqual(verifyProductChanges(original, { sale_unit_price: 145, name_long: "details", internal_id: "NEW" }), { verified: ["sale_unit_price"], unverified: ["name_long"], mismatched: ["internal_id"] });
});

type Row = { id: string; productId: string; status: string; requestData?: unknown; beforeData?: unknown; message: string; createdAt: Date; updatedAt: Date };
function fixture(operation: ErpProductOperation = { kind: "product", changes: { internal_id: "NEW", description: "Nuevo" } }) {
  const rows: Row[] = [], requests: Array<{ path: string; method?: string; body?: unknown }> = [];
  let record: Record<string, unknown> = { ...original };
  let postError: Error | null = null, response: unknown = { success: true }, postReadError = false, ignoreChanges = false, concurrentLocalEdit = false;
  let corruptImage = false;
  const localUpdates: unknown[] = [];
  const product = { id: "product", externalId: "3744", externalCode: "O186", externalSource: "test", code: "O186", updatedAt: new Date() };
  const model = {
    findUnique: async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null,
    findFirst: async ({ where }: { where: { productId: string; status: { in: string[] } } }) => rows.find((r) => r.productId === where.productId && where.status.in.includes(r.status)) ?? null,
    create: async ({ data }: { data: Row }) => { const row = { ...data, createdAt: new Date(), updatedAt: new Date() }; rows.push(row); return row; },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => { const row = rows.find((r) => r.id === where.id)!; Object.assign(row, data); return row; },
  };
  const transaction = { $executeRaw: async () => 1, erpEditorialWrite: model, product: {
    findUnique: async () => product, findFirst: async () => null,
    updateMany: async (args: unknown) => { localUpdates.push(args); return { count: concurrentLocalEdit ? 0 : 1 }; },
  } };
  const db = { ...transaction, $transaction: async (fn: (tx: typeof transaction) => unknown) => fn(transaction) } as unknown as PrismaClient;
  const client = { source: "test", request: async (path: string, options: { method?: string; body?: unknown; retry?: boolean } = {}) => {
    requests.push({ path, ...options }); assert.equal(options.retry, false);
    if (options.method === "POST") {
      assert.equal(rows[0].status, "SENDING"); assert.ok(rows[0].beforeData); assert.ok(rows[0].requestData);
      if (postError) throw postError;
      if (!ignoreChanges && path === "/items/update") record = { ...record, ...options.body as object };
      // This ERP doesn't expose the long editorial fields on readback.
      delete record.name_long; delete record.factory_code;
      if (corruptImage) record.image_url = "https://erp.example/logo/imagen-no-disponible.jpg";
      return response;
    }
    if (postReadError && requests.some((r) => r.method === "POST")) throw new Error("Read failed");
    return { data: { ...record } };
  } };
  const input = { productId: "product", requestId: randomUUID(), actorEmail: "admin@example.test", revision: productRevision(original), operation };
  return { rows, requests, localUpdates, product, db, client, input,
    setPostError: (e: Error) => { postError = e; }, setResponse: (r: unknown) => { response = r; },
    changeRecord: () => { record.sale_unit_price = 999; }, failReadback: () => { postReadError = true; },
    ignoreChanges: () => { ignoreChanges = true; }, changeLocal: () => { concurrentLocalEdit = true; }, corruptImage: () => { corruptImage = true; } };
}
test("confirmed code change updates local externalCode by stable ID and duplicate submit sends once", async () => {
  const f = fixture(); assert.equal((await sendErpProduct(f.input, f)).status, "ACCEPTED");
  assert.deepEqual(f.localUpdates[0], { where: { id: "product", updatedAt: f.product.updatedAt }, data: { syncHash: null, syncQuickHash: null, code: "NEW", externalCode: "NEW", name: "Nuevo" } });
  const replay = await sendErpProduct(f.input, f); assert.equal(f.requests.filter((r) => r.method === "POST").length, 1);
  assert.ok(!("beforeData" in replay)); assert.ok(!("requestData" in replay));
  await assert.rejects(sendErpProduct({ ...f.input, operation: { kind: "product", changes: { description: "Other" } } }, f), /otra operación/);
});
test("stale snapshots and wrong sources cannot write", async () => {
  const f = fixture(); f.changeRecord(); assert.equal((await sendErpProduct(f.input, f)).status, "FAILED"); assert.equal(f.requests.filter((r) => r.method === "POST").length, 0);
  const other = fixture(); other.product.externalSource = "other";
  await assert.rejects(sendErpProduct(other.input, other), /vinculado/); assert.equal(other.requests.length, 0);
});
test("ambiguous stock results block replay, including a new request ID", async () => {
  const f = fixture({ kind: "inventory", type: "output", quantity: 3, warehouseId: 1 }); f.setPostError(new Error("timeout"));
  assert.equal((await sendErpProduct(f.input, f)).status, "UNCERTAIN");
  await sendErpProduct(f.input, f);
  await assert.rejects(sendErpProduct({ ...f.input, requestId: randomUUID() }, f), /pendiente/);
  assert.equal(f.requests.filter((r) => r.method === "POST").length, 1); assert.equal(f.localUpdates.length, 0);
});
test("explicit rejection differs from unconfirmed response and failed readback", async () => {
  const f = fixture(); f.setPostError(new FacturadorApiError("validation", 422, {})); assert.equal((await sendErpProduct(f.input, f)).status, "FAILED");
  const negative = fixture(); negative.setResponse({ success: false }); assert.equal((await sendErpProduct(negative.input, negative)).status, "UNCERTAIN");
  const missing = fixture(); missing.failReadback(); assert.equal((await sendErpProduct(missing.input, missing)).status, "UNCERTAIN");
  const mismatch = fixture(); mismatch.ignoreChanges(); assert.equal((await sendErpProduct(mismatch.input, mismatch)).status, "UNCERTAIN");
  const resetImage = fixture(); resetImage.corruptImage(); assert.equal((await sendErpProduct(resetImage.input, resetImage)).status, "UNCERTAIN");
});
test("unreadable editorial fields aren't claimed verified and concurrent local edits aren't overwritten", async () => {
  const f = fixture({ kind: "product", changes: { name_long: "Details" } });
  const result = await sendErpProduct(f.input, f); assert.equal(result.status, "ACCEPTED"); assert.match(result.message, /no permite verificar/);
  const concurrent = fixture(); concurrent.changeLocal(); assert.match((await sendErpProduct(concurrent.input, concurrent)).message, /cambió en la web/);
});
test("an unavailable new image blocks the entire product write before POST", async () => {
  const f = fixture({ kind: "product", changes: { image_url: "https://erp.example/storage/uploads/items/new.jpg" } });
  const result = await sendErpProduct(f.input, { ...f, checkImage: async () => { throw new Error("Image missing"); } });
  assert.equal(result.status, "FAILED"); assert.equal(f.requests.filter((r) => r.method === "POST").length, 0);
});
