import assert from "node:assert/strict";
import { test } from "node:test";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createFlowTemplate } from "./flow-definition";

type Row = Record<string, unknown>;
type Query = { where?: Row; data?: Row; include?: Row; orderBy?: unknown; take?: number; select?: Row };
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object") {
      const condition = value as Row;
      if ("not" in condition) return row[key] !== condition.not;
      if (Array.isArray(condition.in)) return condition.in.includes(row[key]);
    }
    return row[key] === value;
  });
}
function assign(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) {
    row[key] = value && typeof value === "object" && "increment" in value
      ? Number(row[key]) + Number((value as Row).increment) : structuredClone(value);
  }
  row.updatedAt = new Date();
}

test("servicio de automatizaciones: borradores, publicación, aislamiento y ejecución", async (t) => {
  const beforePrisma = global.prismaGlobal;
  const originalFetch = global.fetch;
  const keys = ["N8N_BASE_URL", "N8N_WRITE_API_KEY", "AUTOMATIONS_CALLBACK_URL", "AUTOMATIONS_EXECUTION_SECRET", "AUTOMATIONS_WHATSAPP_ENABLED", "N8N_OUTBOUND_WEBHOOK_URL", "N8N_OUTBOUND_API_KEY", "PUSHER_APP_ID"];
  const env = new Map(keys.map((key) => [key, process.env[key]]));
  t.after(() => { global.prismaGlobal = beforePrisma; global.fetch = originalFetch; for (const [key, value] of env) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  Object.assign(process.env, {
    N8N_BASE_URL: "https://n8n.example.test", N8N_WRITE_API_KEY: "write-test", AUTOMATIONS_CALLBACK_URL: "https://app.example.test",
    AUTOMATIONS_EXECUTION_SECRET: "test-signing-secret-at-least-32-characters", AUTOMATIONS_WHATSAPP_ENABLED: "false",
    N8N_OUTBOUND_WEBHOOK_URL: "https://n8n.example.test/webhook/outbound", N8N_OUTBOUND_API_KEY: "outbound-test",
  });
  delete process.env.PUSHER_APP_ID;
  let db: Record<string, Row[]> = { automations: [], versions: [], executions: [], messages: [], conversations: [] };
  let sequence = 0;
  let masterEnabled = true;
  let failDatabaseUpdate = false;
  function model(table: string) {
    return {
      findFirst: async ({ where }: Query) => structuredClone(db[table].find((r) => matches(r, where)) || null),
      findUnique: async ({ where, include }: Query) => {
        const row = db[table].find((r) => matches(r, where)); if (!row) return null;
        const result = structuredClone(row);
        if (table === "automations" && include) {
          result.versions = structuredClone(db.versions.filter((r) => r.automationId === row.id).sort((a, b) => Number(b.version) - Number(a.version)));
          result.executions = structuredClone(db.executions.filter((r) => r.automationId === row.id));
        }
        if (table === "executions" && include) {
          result.automation = structuredClone(db.automations.find((r) => r.id === row.automationId));
          result.version = structuredClone(db.versions.find((r) => r.id === row.automationVersionId));
          result.conversation = structuredClone(db.conversations.find((r) => r.id === row.conversationId));
        }
        if (table === "messages" && include) result.conversation = structuredClone(db.conversations.find((r) => r.id === row.conversationId));
        return result;
      },
      create: async ({ data = {} }: Query) => {
        const row = { id: `${table}-${++sequence}`, createdAt: new Date(), updatedAt: new Date(), ...structuredClone(data) };
        db[table].push(row);
        if (table === "automations" && data.versions) {
          const version = (data.versions as { create: Row }).create;
          db.versions.push({ id: `version-${++sequence}`, automationId: row.id, ...structuredClone(version) });
        }
        return structuredClone(row);
      },
      update: async ({ where, data = {} }: Query) => {
        if (table === "automations" && failDatabaseUpdate) throw new Error("Database update failed");
        const row = db[table].find((r) => matches(r, where)); if (!row) throw new Error("Missing record");
        assign(row, data); return structuredClone(row);
      },
      updateMany: async ({ where, data = {} }: Query) => {
        const rows = db[table].filter((r) => matches(r, where)); rows.forEach((row) => assign(row, data)); return { count: rows.length };
      },
    };
  }
  let transactionTail = Promise.resolve();
  const mock = {
    automation: model("automations"), automationVersion: model("versions"), automationExecution: model("executions"),
    chatMessage: model("messages"), conversation: model("conversations"), storeSettings: { findFirst: async () => ({ botMasterSwitch: masterEnabled }) },
    $executeRaw: async () => 0,
    $transaction: async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
      const previous = transactionTail; let release!: () => void;
      transactionTail = new Promise<void>((resolve) => { release = resolve; });
      await previous; const snapshot = structuredClone(db);
      try { return await callback(mock as unknown as Prisma.TransactionClient); } catch (error) { db = snapshot; throw error; } finally { release(); }
    },
  };
  global.prismaGlobal = mock as unknown as PrismaClient;
  const service = await import("./service");
  const executionService = await import("./execution-service");
  const callback = await import("../../app/api/internal/automations/execute/route");
  const retiredCallback = await import("../../app/api/webhook/n8n/execution-status/route");
  const remote: Array<{ url: string; method: string; body: Row }> = [];
  let rejectActivation = false;
  let rejectOutbound = false;
  let outboundCalls = 0;
  global.fetch = async (url, init) => {
    const address = String(url); const body = init?.body ? JSON.parse(String(init.body)) as Row : {};
    remote.push({ url: address, method: init?.method || "GET", body });
    if (address.endsWith("/webhook/outbound")) {
      outboundCalls++;
      return rejectOutbound ? Response.json({ error: "Failed" }, { status: 502 }) : Response.json({ ok: true, provider: "manychat", messageId: `remote-${outboundCalls}` });
    }
    if (address.includes("/webhook/importadora-flow-")) return callback.POST(new Request("https://app.example.test/api/internal/automations/execute", { method: "POST", body: JSON.stringify({ ...body, providerExecutionId: "n8n-run" }) }));
    if (address.endsWith("/activate") && rejectActivation) return Response.json({ error: "Denied" }, { status: 403 });
    return Response.json({ id: `workflow-${remote.length}`, active: address.endsWith("/activate") });
  };
  const automation = await service.createAutomation({ name: "Atención", template: "welcome" });
  let detail = await service.getAutomation(automation.id);
  const draft = () => detail.versions.find((v) => v.status === "DRAFT")!;
  const saveBody = () => ({ name: "Atención", description: "", draftVersionId: draft().id, currentVersionNumber: draft().version, flowDefinition: draft().flowDefinition });
  const publishBody = () => ({ draftVersionId: draft().id, currentVersionNumber: draft().version });

  await t.test("crear ya persiste el diagrama y guardar incrementa la revisión", async () => {
    assert.ok((draft().flowDefinition as unknown as { nodes: unknown[] }).nodes.length > 0);
    detail = await service.saveAutomation(automation.id, saveBody());
    assert.equal(draft().version, 2);
  });
  await t.test("dos guardados con la misma revisión no pueden sobrescribirse", async () => {
    const body = saveBody();
    const result = await Promise.allSettled([service.saveAutomation(automation.id, body), service.saveAutomation(automation.id, body)]);
    assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
    detail = await service.getAutomation(automation.id);
  });
  await t.test("rechaza borradores ajenos y cambios de estado mediante PATCH", async () => {
    const other = await service.createAutomation({ name: "Otro" });
    await assert.rejects(service.saveAutomation(other.id, saveBody()), /borrador cambió/);
    await assert.rejects(service.saveAutomation(automation.id, { ...saveBody(), status: "ACTIVE" }));
  });
  await t.test("publicación obsoleta no hace llamadas a n8n", async () => {
    const before = remote.length;
    await assert.rejects(service.publishAutomation(automation.id, { ...publishBody(), currentVersionNumber: 1 }), /borrador cambió/);
    assert.equal(remote.length, before);
  });
  await t.test("rechazo de activación conserva el borrador y elimina el workflow parcial", async () => {
    rejectActivation = true;
    await assert.rejects(service.publishAutomation(automation.id, publishBody()), /No se pudo publicar/);
    assert.equal((await service.getAutomation(automation.id)).status, "DRAFT");
    assert.equal(remote.at(-1)?.method, "DELETE"); rejectActivation = false;
  });
  await t.test("una falla de base de datos también revierte la publicación", async () => {
    failDatabaseUpdate = true;
    await assert.rejects(service.publishAutomation(automation.id, publishBody()), /No se pudo publicar/);
    failDatabaseUpdate = false;
    assert.equal((await service.getAutomation(automation.id)).currentPublishedVersionId, undefined);
    assert.equal(remote.at(-1)?.method, "DELETE");
  });
  await t.test("publicar crea una versión inmutable y un nuevo borrador, sin activar clientes", async () => {
    const previousDraft = draft().id;
    detail = await service.publishAutomation(automation.id, publishBody());
    assert.equal(detail.status, "PAUSED"); assert.equal(detail.currentPublishedVersionId, previousDraft);
    assert.notEqual(draft().id, previousDraft);
    await assert.rejects(service.saveAutomation(automation.id, { ...saveBody(), draftVersionId: previousDraft }), /borrador cambió/);
    const creation = remote.find((r) => r.url.endsWith("/workflows"));
    assert.equal("active" in creation!.body, false);
  });
  await t.test("el modo de pruebas y el interruptor global impiden activar atención real", async () => {
    await assert.rejects(service.changeAutomationStatus(automation.id, "ACTIVE"), /modo de pruebas/);
    process.env.AUTOMATIONS_WHATSAPP_ENABLED = "true"; masterEnabled = false;
    await assert.rejects(service.changeAutomationStatus(automation.id, "ACTIVE"), /bot global/);
    masterEnabled = true; detail = await service.changeAutomationStatus(automation.id, "ACTIVE");
    assert.equal(detail.status, "ACTIVE");
  });
  const contact = { name: "Ana", externalId: "contact-real", phoneNormalized: "51999999999", manychatSubscriberId: "12345" };
  db.conversations.push({ id: "conversation", channel: "WHATSAPP", status: "AUTOMATICO", botEnabled: true, assignedUserId: null, contact });
  function inbound(id: string) { db.messages.push({ id, conversationId: "conversation", direction: "INBOUND", messageType: "TEXT", content: "Hola" }); }
  await t.test("un mensaje entrante viaja por n8n, se envía como bot y finaliza una sola vez", async () => {
    inbound("incoming"); await executionService.dispatchAutomation("incoming");
    assert.equal(outboundCalls, 1); assert.equal(db.executions[0].status, "SUCCESS");
    assert.equal(db.conversations[0].botEnabled, true);
    assert.equal(db.messages.find((r) => r.direction === "OUTBOUND")?.senderType, "BOT");
    await executionService.dispatchAutomation("incoming"); assert.equal(outboundCalls, 1);
    const signed = remote.find((r) => r.url.includes("/webhook/importadora-flow-"))!.body;
    const replay = await callback.POST(new Request("https://app.example.test", { method: "POST", body: JSON.stringify(signed) }));
    assert.equal((await replay.json()).duplicate, true); assert.equal(outboundCalls, 1);
  });
  await t.test("firma alterada y callback antiguo no modifican registros", async () => {
    const signed = remote.find((r) => r.url.includes("/webhook/importadora-flow-"))!.body;
    const forged = await callback.POST(new Request("https://app.example.test", { method: "POST", body: JSON.stringify({ ...signed, signature: "0".repeat(64) }) }));
    assert.equal(forged.status, 401); assert.equal((await retiredCallback.POST()).status, 410); assert.equal(outboundCalls, 1);
  });
  await t.test("BC owns its production contacts without a competing automation reply", async () => {
    const config = { BC_LIVE_ENABLED: "true", BC_LIVE_SCOPE: "ALL", BC_LIVE_STARTED_AT: "2026-01-01T00:00:00Z" };
    const previous = new Map(Object.keys(config).map(key => [key, process.env[key]]));
    try {
      Object.assign(process.env, config);
      const before = remote.length;
      inbound("bc-owned"); await executionService.dispatchAutomation("bc-owned");
      assert.equal(remote.length, before);
      assert.equal(db.executions.some(row => row.messageId === "bc-owned"), false);
    } finally {
      for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
  });
  await t.test("simulaciones, bot apagado y atención humana no disparan flujos", async () => {
    const before = remote.length;
    inbound("simulation"); (db.conversations[0].contact as Row).externalId = "SIMULATOR:test";
    await executionService.dispatchAutomation("simulation");
    (db.conversations[0].contact as Row).externalId = "contact-real";
    masterEnabled = false; await executionService.dispatchAutomation("simulation"); masterEnabled = true;
    db.conversations[0].status = "ATENDIENDO"; await executionService.dispatchAutomation("simulation"); db.conversations[0].status = "AUTOMATICO";
    assert.equal(remote.length, before);
  });
  await t.test("pausar detiene una ejecución que estaba en cola sin enviar respuestas", async () => {
    const before = outboundCalls;
    db.executions.push({ id: "queued-before-pause", automationId: automation.id, automationVersionId: detail.currentPublishedVersionId, conversationId: "conversation", messageId: "incoming", status: "QUEUED" });
    await service.changeAutomationStatus(automation.id, "PAUSED");
    const result = await executionService.executeAutomation({ executionId: "queued-before-pause", versionId: detail.currentPublishedVersionId! });
    assert.equal(result.status, "SKIPPED"); assert.equal(outboundCalls, before);
    detail = await service.changeAutomationStatus(automation.id, "ACTIVE");
  });
  await t.test("otro flujo no puede activarse mientras WhatsApp tiene uno activo", async () => {
    const another = await service.createAutomation({ name: "Otra atención" });
    const otherDetail = await service.getAutomation(another.id);
    const otherDraft = otherDetail.versions[0];
    await service.publishAutomation(another.id, { draftVersionId: otherDraft.id, currentVersionNumber: otherDraft.version });
    await assert.rejects(service.changeAutomationStatus(another.id, "ACTIVE"), /Pausa/);
  });
  await t.test("una entrega fallida marca mensaje y ejecución sin volver a intentar", async () => {
    rejectOutbound = true; inbound("failure"); await executionService.dispatchAutomation("failure"); rejectOutbound = false;
    assert.equal(db.executions.at(-1)?.status, "FAILED"); assert.equal(db.messages.at(-1)?.status, "failed");
    const count = outboundCalls; await executionService.dispatchAutomation("failure"); assert.equal(outboundCalls, count);
  });
  await t.test("derivar apaga el bot y deja la conversación pendiente de asesor", async () => {
    detail = await service.getAutomation(automation.id);
    detail = await service.saveAutomation(automation.id, { ...saveBody(), flowDefinition: createFlowTemplate("sales") });
    detail = await service.publishAutomation(automation.id, publishBody());
    detail = await service.changeAutomationStatus(automation.id, "ACTIVE");
    inbound("handoff"); db.messages.at(-1)!.content = "Necesito asesor";
    await executionService.dispatchAutomation("handoff");
    assert.equal(db.conversations[0].status, "REQUIERE_ASESOR"); assert.equal(db.conversations[0].botEnabled, false);
  });
});
