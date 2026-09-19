import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { buildEditorialFields, buildErpEditorialPayload } from "./editorial-payload";
import { FacturadorApiError } from "./client";
import { markErpEditorialReviewed, sendErpEditorial } from "./editorial-write";

const record = {
  id: 3744, internal_id: "O186", description: "Título original", name: "Descripción anterior", second_name: null,
  image_url: "https://erp.example/storage/uploads/items/original.jpg", category_id: 4,
  unit_type_id: "NIU", currency_type_id: "PEN", sale_unit_price: 145, purchase_unit_price: 124,
  sale_affectation_igv_type_id: "10", purchase_affectation_igv_type_id: "10", has_igv: true,
  stock: 60, item_unit_types: [{ price2: 155 }],
};
const content = { descriptionShort: "Cargador", descriptionFull: "Texto completo", specifications: [{ name: "Potencia", value: "120 W" }] };
const identity = { externalId: "3744", code: "O186" };

test("preserves the ERP title, exact prices and image while sending editorial HTML", () => {
  const payload = buildErpEditorialPayload(record, identity, content);
  assert.equal(payload.description, record.description);
  assert.equal(payload.name, record.name);
  assert.equal(payload.image, "original.jpg");
  assert.equal(payload.image_url, record.image_url);
  assert.equal(payload.temp_path, null);
  assert.equal(payload.sale_unit_price, 145);
  assert.equal(payload.purchase_unit_price, 124);
  assert.equal(payload.factory_code, "Potencia: 120 W");
  assert.match(payload.name_long, /<th>Potencia<\/th><td>120 W<\/td>/);
  assert.ok(!("stock" in payload));
  assert.ok(!("item_unit_types" in payload));
  assert.ok(!("brand_id" in payload), "never guess fields omitted by the ERP");
});

test("escapes untrusted text; the short summary never truncates the full specifications", () => {
  const fields = buildEditorialFields({ descriptionShort: '<img src=x onerror="bad()">', descriptionFull: "a\nb", specifications: [{ name: "Datos", value: "X".repeat(900) }] });
  assert.ok(!fields.name_long.includes("<img"));
  assert.match(fields.name_long, /&lt;img/);
  assert.match(fields.name_long, /a<br>b/);
  assert.equal(fields.factory_code?.length, 250);
  assert.ok(fields.name_long.includes("X".repeat(900)));
  assert.ok(!("factory_code" in buildEditorialFields({ ...content, specifications: [] })), "an empty sheet must not clear remote specs implicitly");
});

test("blocks mismatched identity, missing commercial values and unsupported images before writing", () => {
  assert.throws(() => buildErpEditorialPayload(record, { ...identity, code: "OTHER" }, content), /coincide/);
  for (const field of ["sale_unit_price", "purchase_unit_price", "has_igv", "unit_type_id"]) {
    assert.throws(() => buildErpEditorialPayload({ ...record, [field]: undefined }, identity, content));
  }
  for (const image_url of [null, "javascript:bad()", "https://cdn.example/unknown.jpg", "https://erp.example/storage/uploads/items/a%2Fb.jpg"]) {
    assert.throws(() => buildErpEditorialPayload({ ...record, image_url }, identity, content));
  }
  assert.throws(() => buildEditorialFields({ descriptionShort: "", descriptionFull: "", specifications: [] }), /Escribe/);
  assert.throws(() => buildErpEditorialPayload({ ...record, sale_unit_price: "NaN" }, identity, content), /válidos/);
});

type Row = Record<string, unknown> & { id: string; productId: string; status: string; updatedAt: Date };
function fixture() {
  const rows: Row[] = [];
  const requests: Array<{ path: string; options: { retry?: boolean; method?: string; body?: unknown } }> = [];
  const profileDate = new Date("2026-09-19T12:00:00Z");
  let postError: Error | null = null;
  let readError: Error | null = null;
  let response: unknown = { success: true };
  let failAccepted = false;
  const product = { id: "product", externalId: "3744", externalCode: "O186", externalSource: "test-erp", code: "O186", digitalProfile: { ...content, updatedAt: profileDate }, specifications: content.specifications };
  const model = {
    findUnique: async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null,
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id)!,
    findFirst: async ({ where }: { where: { productId: string; status: { in: string[] } } }) => rows.find((r) => r.productId === where.productId && where.status.in.includes(r.status)) ?? null,
    create: async ({ data }: { data: Row }) => { const row = { ...data, createdAt: new Date(), updatedAt: new Date() }; rows.push(row); return row; },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      if (failAccepted && data.status === "ACCEPTED") throw new Error("Database acknowledgement failed");
      const row = rows.find((r) => r.id === where.id)!; Object.assign(row, data, { updatedAt: new Date() }); return row;
    },
    updateMany: async ({ where, data }: { where: { id: string; status: string; updatedAt: Date }; data: Partial<Row> }) => {
      const row = rows.find((r) => r.id === where.id && r.status === where.status && r.updatedAt === where.updatedAt);
      if (!row) return { count: 0 }; Object.assign(row, data); return { count: 1 };
    },
  };
  const transaction = { $executeRaw: async () => 1, erpEditorialWrite: model, product: { findUnique: async () => product } };
  const db = { ...transaction, $transaction: async (fn: (tx: typeof transaction) => unknown) => fn(transaction) } as unknown as PrismaClient;
  const client = { source: "test-erp", request: async (path: string, options: { retry?: boolean; method?: string; body?: unknown } = {}) => {
    requests.push({ path, options });
    assert.equal(options.retry, false);
    if (options.method === "POST") {
      assert.ok(rows[0].beforeData, "backup persisted before POST");
      assert.ok(rows[0].requestData, "exact request persisted before POST");
      assert.equal(rows[0].status, "SENDING");
      if (postError) throw postError;
      return response;
    }
    if (readError) throw readError;
    return { data: record };
  } };
  const input = { productId: "product", requestId: randomUUID(), actorEmail: "admin@example.test", expectedProfileUpdatedAt: profileDate.toISOString() };
  return { rows, requests, product, db, client, input,
    setPostError: (e: Error) => { postError = e; }, setReadError: (e: Error) => { readError = e; },
    setResponse: (v: unknown) => { response = v; }, failAccepted: () => { failAccepted = true; } };
}

test("acknowledges acceptance without claiming read-back verification; identical request is not sent twice", async () => {
  const f = fixture();
  const result = await sendErpEditorial(f.input, f);
  assert.equal(result.status, "ACCEPTED");
  assert.match(result.message, /no devuelve/);
  await sendErpEditorial(f.input, f);
  assert.equal(f.requests.filter((r) => r.options.method === "POST").length, 1);
});

test("preflight failures and stale profiles never send a POST", async () => {
  const f = fixture(); f.setReadError(new FacturadorApiError("Too Many Attempts", 500, {}));
  assert.equal((await sendErpEditorial(f.input, f)).status, "FAILED");
  assert.equal(f.requests.length, 1);
  const stale = fixture();
  await assert.rejects(sendErpEditorial({ ...stale.input, expectedProfileUpdatedAt: "2025-01-01T00:00:00.000Z" }, stale), /cambió/);
  assert.equal(stale.requests.length, 0);
  const other = fixture(); other.product.externalSource = "another-erp";
  await assert.rejects(sendErpEditorial(other.input, other), /otra conexión/);
  assert.equal(other.requests.length, 0);
});

test("ambiguous POST results block another send until an administrator records a review", async () => {
  const f = fixture(); f.setPostError(new Error("network timeout"));
  assert.equal((await sendErpEditorial(f.input, f)).status, "UNCERTAIN");
  await assert.rejects(sendErpEditorial({ ...f.input, requestId: randomUUID() }, f), /pendiente de revisión/);
  assert.equal(f.requests.filter((r) => r.options.method === "POST").length, 1);
  const reviewed = await markErpEditorialReviewed(f.input, f.db);
  assert.equal(reviewed.status, "REVIEWED");
});

test("provider rejection is FAILED; 5xx, success:false and lost local acknowledgement remain UNCERTAIN", async () => {
  const rejected = fixture(); rejected.setPostError(new FacturadorApiError("validation", 422, {}));
  assert.equal((await sendErpEditorial(rejected.input, rejected)).status, "FAILED");
  const serverError = fixture(); serverError.setPostError(new FacturadorApiError("server", 500, {}));
  assert.equal((await sendErpEditorial(serverError.input, serverError)).status, "UNCERTAIN");
  const falseSuccess = fixture(); falseSuccess.setResponse({ success: false });
  assert.equal((await sendErpEditorial(falseSuccess.input, falseSuccess)).status, "UNCERTAIN");
  const localError = fixture(); localError.failAccepted();
  assert.equal((await sendErpEditorial(localError.input, localError)).status, "UNCERTAIN");
});

test("manual review cannot interrupt a fresh active send", async () => {
  const f = fixture();
  f.rows.push({ ...f.input, id: f.input.requestId, status: "SENDING", updatedAt: new Date() });
  await assert.rejects(markErpEditorialReviewed(f.input, f.db), /en curso/);
  f.rows[0].updatedAt = new Date(Date.now() - 130000);
  assert.equal((await markErpEditorialReviewed(f.input, f.db)).status, "REVIEWED");
});
