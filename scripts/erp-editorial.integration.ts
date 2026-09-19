import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { sendErpEditorial, markErpEditorialReviewed } from "../src/lib/facturador/editorial-write";

const url = new URL(process.env.DATABASE_URL!);
assert.equal(url.pathname, "/erp_editorial_test_20260919", "Requires the disposable integration database");
const db = new PrismaClient();
async function main() {
  const product = await db.product.create({ data: {
    code: "TEST-EDITORIAL", slug: "test-editorial", name: "Local title", unitPrice: 1,
    externalId: "3744", externalCode: "O186", externalSource: "integration",
    digitalProfile: { create: { descriptionFull: "Descripción investigada" } },
    specifications: { create: { name: "Potencia", value: "120 W" } },
  }, include: { digitalProfile: true } });
  const input = { productId: product.id, actorEmail: "integration@example.invalid", expectedProfileUpdatedAt: product.digitalProfile!.updatedAt.toISOString() };
  const record = { id: 3744, internal_id: "O186", description: "ERP title", name: "Original description",
    unit_type_id: "NIU", currency_type_id: "PEN", sale_unit_price: 145, purchase_unit_price: 124,
    sale_affectation_igv_type_id: "10", purchase_affectation_igv_type_id: "10", has_igv: true,
    image_url: "https://erp.example/storage/uploads/items/original.jpg" };
  let release!: () => void;
  let reached!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const entered = new Promise<void>((resolve) => { reached = resolve; });
  let posts = 0;
  const client = { source: "integration", async request(_path: string, options?: { method?: string }) {
    if (options?.method !== "POST") return { data: record };
    posts++;
    const saved = await db.erpEditorialWrite.findFirstOrThrow({ where: { productId: product.id } });
    assert.equal(saved.status, "SENDING");
    assert.ok(saved.beforeData && saved.requestData);
    reached(); await blocked;
    return { success: true };
  } };
  const requestId = randomUUID();
  const first = sendErpEditorial({ ...input, requestId }, { db, client });
  await entered;
  const duplicate = await sendErpEditorial({ ...input, requestId }, { db, client });
  assert.equal(duplicate.status, "SENDING");
  await assert.rejects(sendErpEditorial({ ...input, requestId: randomUUID() }, { db, client }), /pendiente de revisión/);
  await assert.rejects(db.erpEditorialWrite.create({ data: { id: randomUUID(), productId: product.id,
    status: "PREPARING", actorEmail: input.actorEmail, message: "Must be rejected by database index" } }), /Unique constraint/);
  release();
  assert.equal((await first).status, "ACCEPTED");
  assert.equal(posts, 1);
  assert.equal((await sendErpEditorial({ ...input, requestId }, { db, client })).status, "ACCEPTED");
  assert.equal(posts, 1);
  const uncertain = await sendErpEditorial({ ...input, requestId: randomUUID() }, { db, client: {
    source: "integration", async request(_path, options) {
      if (options?.method === "POST") throw new Error("Connection lost after POST");
      return { data: record };
    },
  } });
  assert.equal(uncertain.status, "UNCERTAIN");
  assert.equal((await markErpEditorialReviewed({ ...input, requestId: uncertain.id }, db)).status, "REVIEWED");
  console.log("PASS: PostgreSQL reservation, idempotency, concurrent sends, partial unique index, backups and uncertain-write review");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
