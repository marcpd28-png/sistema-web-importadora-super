import assert from "node:assert/strict";
import { test } from "node:test";
import {
  disconnectLocalWhatsappIntegration,
  upsertLocalWhatsappIntegration,
  type WhatsappIntegrationUpsertArgs,
  type WhatsappIntegrationUpsertData,
} from "./whatsapp-integrations";
import { selectDeterministicActiveWhatsappIntegration } from "./whatsapp-credentials";
import { embeddedSignupSessionSchema, resolveEmbeddedSignupPhone } from "./whatsapp-meta-schema";

const baseData: WhatsappIntegrationUpsertData = {
  businessId: "business-1",
  wabaId: "waba-1",
  phoneNumberId: "phone-1",
  displayPhoneNumber: "+51999999999",
  verifiedName: "Local Test",
  accessTokenEncrypted: "v1:encrypted",
  tokenType: "Bearer",
  scopes: ["whatsapp_business_messaging"],
  status: "ACTIVE",
  connectedByUserId: "admin-1",
  lastVerifiedAt: new Date("2026-09-05T10:00:00.000Z"),
};

test("disconnect local no llama Meta", async () => {
  let deletedId = "";
  let metaCalled = false;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    metaCalled = true;
    throw new Error("Meta no debe ser llamado");
  }) as typeof fetch;

  try {
    await disconnectLocalWhatsappIntegration(async ({ where }) => {
      deletedId = where.id;
      return { id: where.id };
    }, "integration-1");
    assert.equal(deletedId, "integration-1");
    assert.equal(metaCalled, false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("la clave compuesta evita duplicados lógicos", async () => {
  const records = new Map<string, WhatsappIntegrationUpsertData>();
  const delegate = async ({ where, create, update }: WhatsappIntegrationUpsertArgs) => {
      const key = JSON.stringify(where.businessId_wabaId_phoneNumberId);
      records.set(key, records.has(key) ? update : create);
      return records.get(key);
  };

  await upsertLocalWhatsappIntegration(delegate, baseData);
  await upsertLocalWhatsappIntegration(delegate, baseData);
  assert.equal(records.size, 1);
});

test("la reconexión actualiza el registro mediante upsert", async () => {
  let calls = 0;
  let saved: WhatsappIntegrationUpsertData | undefined;
  const delegate = async ({ update }: WhatsappIntegrationUpsertArgs) => {
      calls += 1;
      saved = update;
      return update;
  };

  await upsertLocalWhatsappIntegration(delegate, baseData);
  await upsertLocalWhatsappIntegration(delegate, { ...baseData, accessTokenEncrypted: "v1:new-encrypted" });
  assert.equal(calls, 2);
  assert.ok(saved);
  assert.equal(saved.accessTokenEncrypted, "v1:new-encrypted");
});

test("resuelve el único teléfono cuando SessionInfo no trae phone_number_id", () => {
  const session = embeddedSignupSessionSchema.parse({ business_id: "business-1", waba_id: "waba-1" });
  assert.equal(session.phone_number_id, undefined);
  const result = resolveEmbeddedSignupPhone(null, [{ id: "phone-1", displayPhoneNumber: null, verifiedName: null }]);
  assert.equal(result.status, "RESOLVED");
  assert.equal(result.status === "RESOLVED" ? result.phone.id : null, "phone-1");
});

test("no elige arbitrariamente entre múltiples teléfonos", () => {
  const result = resolveEmbeddedSignupPhone(null, [
    { id: "phone-1", displayPhoneNumber: null, verifiedName: null },
    { id: "phone-2", displayPhoneNumber: null, verifiedName: null },
  ]);
  assert.equal(result.status, "PHONE_SELECTION_REQUIRED");
});

test("el resolver activo es determinista incluso con la misma fecha de actualización", () => {
  const rows = [
    { id: "integration-a", updatedAt: new Date("2026-09-05T10:00:00.000Z"), createdAt: new Date("2026-09-04T10:00:00.000Z") },
    { id: "integration-b", updatedAt: new Date("2026-09-05T10:00:00.000Z"), createdAt: new Date("2026-09-04T10:00:00.000Z") },
  ];
  assert.equal(selectDeterministicActiveWhatsappIntegration(rows)?.id, "integration-b");
});
