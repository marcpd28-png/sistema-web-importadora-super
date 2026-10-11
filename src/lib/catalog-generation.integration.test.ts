import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, beforeEach, test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { CatalogGenerationWorker, MAX_DELIVERY_ATTEMPTS, catalogRetryAt } from "./catalog-generation";
import { RockyOutbox } from "./rocky-outbox";

const url = process.env.ROCKY_TEST_DATABASE_URL;
if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).pathname !== "/rocky_phase2_integration" || process.env.DATABASE_URL !== url) {
  throw new Error("Both database variables must target disposable localhost rocky_phase2_integration");
}

const db = new PrismaClient({ datasourceUrl: url });
const now = new Date("2026-10-11T17:00:00.000Z");
const recipient = "+15005550006";

function outbox() {
  return new RockyOutbox(db, async () => ({ messageId: randomUUID(), provider: "ycloud" }), () => {});
}

async function fixture(partCount = 1, state: "ready" | "running" = "ready") {
  const contact = await db.chatContact.create({ data: { channel: "WHATSAPP", externalId: recipient, phone: recipient, phoneNormalized: recipient, name: "Synthetic catalog" } });
  const conversation = await db.conversation.create({ data: { contactId: contact.id, botEnabled: true, status: "AUTOMATICO" } });
  const trigger = await db.chatMessage.create({ data: { conversationId: conversation.id, direction: "INBOUND", senderType: "CUSTOMER", content: "Catálogo de drones", status: "received" } });
  const job = await db.catalogGenerationJob.create({
    data: {
      conversationId: conversation.id,
      triggerMessageId: trigger.id,
      conversationRevision: 0,
      globalRevision: 0,
      scopeKey: "drones",
      title: "CATÁLOGO DE DRONES",
      snapshot: { version: 1, scopeKey: "drones", title: "CATÁLOGO DE DRONES", capturedAt: now.toISOString(), products: [{ id: "drone", name: "DRON", code: "DRONE-1", brand: null, category: "Drones", imageUrls: ["https://example.invalid/drone.jpg"], updatedAt: now.toISOString(), unitPrice: "100", wholesalePrice: null, wholesaleMinQty: 3 }] },
      snapshotHash: randomUUID().replaceAll("-", ""),
      result: { version: 1, parts: Array.from({ length: partCount }, (_, index) => ({ partNumber: index + 1 })) },
      state,
      dueAt: state === "ready" ? now : new Date(now.getTime() - 1),
      ...(state === "running" ? { processingToken: "interrupted-worker", leaseExpiresAt: new Date(now.getTime() - 1), deliveryAttempts: 0 } : {}),
    },
  });
  await db.catalogGenerationDelivery.createMany({
    data: Array.from({ length: partCount }, (_, index) => ({ jobId: job.id, partNumber: index + 1, documentUrl: `https://example.invalid/catalog-${index + 1}.pdf`, productCount: 1 })),
  });
  return { conversation, job, trigger };
}

beforeEach(async () => {
  await db.chatContact.deleteMany();
  await db.storeSettings.upsert({ where: { id: 1 }, create: { id: 1, botMasterSwitch: true }, update: { botMasterSwitch: true, automationRevision: 0 } });
});

after(async () => { await db.$disconnect(); });

test("un error de entrega vuelve a ready con backoff y termina tras un presupuesto acotado", async () => {
  const { job } = await fixture();
  const failingOutbox = { runTurn: async () => { throw new Error("synthetic outbox failure"); } } as unknown as RockyOutbox;
  const worker = new CatalogGenerationWorker(db, failingOutbox);

  for (let attempt = 1; attempt <= MAX_DELIVERY_ATTEMPTS; attempt++) {
    const current = await db.catalogGenerationJob.findUniqueOrThrow({ where: { id: job.id } });
    await worker.tick(attempt === 1 ? now : current.dueAt);
    const updated = await db.catalogGenerationJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(updated.deliveryAttempts, attempt);
    if (attempt < MAX_DELIVERY_ATTEMPTS) {
      assert.equal(updated.state, "ready");
      assert.equal(updated.reason, "delivery_retry_pending");
      assert.equal(updated.dueAt.toISOString(), catalogRetryAt(attempt === 1 ? now : current.dueAt, attempt).toISOString());
    } else {
      assert.equal(updated.state, "failed");
      assert.equal(updated.reason, "delivery_attempts_exhausted");
    }
  }
  assert.equal(await db.catalogGenerationDelivery.count({ where: { jobId: job.id, messageId: null } }), 1);
});

test("recupera multipart después de caer tras persistir outbox y antes de guardar messageId", async () => {
  const { job, conversation } = await fixture(2);
  let crashOnce = true;
  const crashDb = new Proxy(db, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property !== "catalogGenerationDelivery") return value;
      return new Proxy(value, {
        get(delegate, method, delegateReceiver) {
          const original = Reflect.get(delegate, method, delegateReceiver);
          if (method !== "updateMany") return original;
          return async (...args: unknown[]) => {
            if (crashOnce) {
              crashOnce = false;
              throw new Error("synthetic crash after outbox persistence");
            }
            return Reflect.apply(original, delegate, args);
          };
        },
      });
    },
  }) as PrismaClient;
  const worker = new CatalogGenerationWorker(crashDb, outbox());

  await worker.tick(now);
  const afterCrash = await db.catalogGenerationJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(afterCrash.state, "ready");
  assert.equal(afterCrash.deliveryAttempts, 1);
  assert.equal(await db.rockyOutboundJob.count({ where: { conversationId: conversation.id } }), 1);
  assert.equal(await db.catalogGenerationDelivery.count({ where: { jobId: job.id, messageId: null } }), 2);

  await worker.tick(afterCrash.dueAt);
  const resumed = await db.catalogGenerationJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(resumed.state, "enqueued");
  assert.equal(await db.rockyOutboundJob.count({ where: { conversationId: conversation.id } }), 2);
  assert.equal(await db.catalogGenerationDelivery.count({ where: { jobId: job.id, messageId: { not: null }, state: "outbox_queued" } }), 2);
});

test("un lease de entrega expirado se recupera sin re-renderizar", async () => {
  const { job, conversation } = await fixture(1, "running");
  const worker = new CatalogGenerationWorker(db, outbox());
  await worker.tick(now);
  const resumed = await db.catalogGenerationJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(resumed.state, "enqueued");
  assert.equal(resumed.attempts, 0);
  assert.equal(resumed.deliveryAttempts, 1);
  assert.equal(await db.rockyOutboundJob.count({ where: { conversationId: conversation.id } }), 1);
});

test("dos workers no duplican las partes de una misma entrega", async () => {
  const { job, conversation } = await fixture(2);
  const first = new CatalogGenerationWorker(db, outbox());
  const second = new CatalogGenerationWorker(db, outbox());
  await Promise.all([first.tick(now), second.tick(now)]);
  const completed = await db.catalogGenerationJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(completed.state, "enqueued");
  assert.equal(await db.rockyOutboundJob.count({ where: { conversationId: conversation.id } }), 2);
  assert.equal(await db.catalogGenerationDelivery.count({ where: { jobId: job.id, messageId: { not: null } } }), 2);
});
