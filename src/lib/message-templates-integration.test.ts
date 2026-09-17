import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma, type MessageTemplate, type PrismaClient } from "@prisma/client";

test("plantillas: persistencia, API n8n y envío con trazabilidad", async (t) => {
  const previousPrisma = global.prismaGlobal;
  const keys = ["N8N_INTERNAL_API_KEY", "N8N_OUTBOUND_WEBHOOK_URL", "N8N_OUTBOUND_API_KEY", "PUSHER_APP_ID"] as const;
  const env = new Map(keys.map((key) => [key, process.env[key]]));
  const originalFetch = global.fetch;
  t.after(() => {
    global.prismaGlobal = previousPrisma; global.fetch = originalFetch;
    for (const key of keys) { const value = env.get(key); if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });
  process.env.N8N_INTERNAL_API_KEY = "test-internal";
  process.env.N8N_OUTBOUND_WEBHOOK_URL = "https://n8n.example.test/webhook/outbound";
  process.env.N8N_OUTBOUND_API_KEY = "test-outbound";
  delete process.env.PUSHER_APP_ID;
  const records = new Map<string, MessageTemplate>();
  const messages: Record<string, unknown>[] = [];
  let dbReads = 0;
  let outboundCalls = 0;
  let outboundBody: Record<string, unknown> = {};
  let rejectOutbound = false;
  const contact = { name: "María", phone: "999999999", phoneNormalized: "51999999999", externalId: "real-contact", manychatSubscriberId: "12345" };
  const mockDb = {
    messageTemplate: {
      findMany: async ({ where }: { where: { isActive?: boolean } }) => { dbReads++; return [...records.values()].filter((r) => where.isActive === undefined || r.isActive === where.isActive); },
      findUnique: async ({ where }: { where: { id: string } }) => { dbReads++; return records.get(where.id) ?? null; },
      create: async ({ data }: { data: Partial<MessageTemplate> }) => {
        if ([...records.values()].some((r) => r.name === data.name)) throw new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "6" });
        const record = { ...data, id: `tpl-${records.size + 1}`, createdAt: new Date(), updatedAt: new Date("2026-09-17T12:00:00.000Z") } as MessageTemplate;
        records.set(record.id, record); return record;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<MessageTemplate> }) => {
        const current = records.get(where.id);
        if (!current) throw new Prisma.PrismaClientKnownRequestError("missing", { code: "P2025", clientVersion: "6" });
        const record = { ...current, ...data, updatedAt: new Date(current.updatedAt.getTime() + 1000) };
        records.set(record.id, record); return record;
      },
    },
    conversation: {
      findUnique: async ({ where }: { where: { id: string } }) => where.id === "conversation-1" ? { id: where.id, contact } : null,
      update: async () => ({}),
    },
    chatMessage: {
      findUnique: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => { const message = { ...data, id: `message-${messages.length}`, createdAt: new Date() }; messages.push(message); return message; },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => { const current = messages.find((m) => m.id === where.id)!; Object.assign(current, data); return current; },
    },
    $transaction: async (callback: (client: unknown) => Promise<unknown>) => callback(mockDb),
  };
  global.prismaGlobal = mockDb as unknown as PrismaClient;
  global.fetch = async (_url, init) => {
    outboundCalls++;
    outboundBody = JSON.parse(String(init?.body));
    return Response.json(rejectOutbound ? { error: "Workflow failed" } : { ok: true, provider: "meta-cloud", messageId: `wamid.${outboundCalls}` }, { status: rejectOutbound ? 500 : 200 });
  };
  const service = await import("./message-templates-service");
  const { templateErrorResponse } = await import("./message-templates-http");
  const api = await import("../app/api/internal/chat/templates/route");
  const messagesService = await import("./messages-service");
  const outgoingApi = await import("../app/api/internal/chat/outgoing/route");
  const request = (body?: unknown, key = "test-internal") => new Request("http://localhost/api/internal/chat/templates", {
    method: body === undefined ? "GET" : "POST", headers: { "x-internal-api-key": key, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let template: MessageTemplate;

  await t.test("crea y edita contenido real; calcula variables; detecta nombres duplicados", async () => {
    template = await service.saveMessageTemplate({ name: "Bienvenida", content: "Hola {{nombre}}", category: "Atención", isActive: true });
    assert.deepEqual(template.variables, ["nombre"]);
    template = await service.saveMessageTemplate({ name: "Bienvenida", content: "Hola {{nombre}}, pedido {{pedido}}", category: "Ventas", isActive: true }, template.id);
    assert.equal(template.category, "Ventas");
    assert.deepEqual(template.variables, ["nombre", "pedido"]);
    await assert.rejects(service.saveMessageTemplate({ name: "Bienvenida", content: "Duplicada" }), (error: unknown) => templateErrorResponse(error).status === 409);
    await assert.rejects(service.saveMessageTemplate({ name: "", content: "" }));
  });
  await t.test("API protegida: no consulta la base con clave inválida o sin configuración", async () => {
    const before = dbReads;
    assert.equal((await api.GET(request(undefined, "wrong"))).status, 401);
    assert.equal((await api.POST(request({ templateId: template.id }, "wrong"))).status, 401);
    delete process.env.N8N_INTERNAL_API_KEY;
    assert.equal((await api.GET(request())).status, 503);
    process.env.N8N_INTERNAL_API_KEY = "test-internal";
    assert.equal(dbReads, before);
  });
  await t.test("solo expone activas; renderiza sin enviar y exige variables pendientes", async () => {
    await service.saveMessageTemplate({ name: "Oculta", content: "No usar", isActive: false });
    const list = await api.GET(request());
    assert.equal(list.headers.get("cache-control"), "no-store");
    assert.equal((await list.json()).items.length, 1);
    const missing = await api.POST(request({ templateId: template.id, conversationId: "conversation-1" }));
    assert.equal(missing.status, 422);
    assert.deepEqual((await missing.json()).missingVariables, ["pedido"]);
    const rendered = await api.POST(request({ templateId: template.id, conversationId: "conversation-1", variables: { pedido: "P-100" } }));
    assert.equal(rendered.status, 200);
    assert.equal((await rendered.json()).content, "Hola María, pedido P-100");
    assert.equal(outboundCalls, 0);
    assert.equal((await api.POST(request({ templateId: "missing" }))).status, 404);
    assert.equal((await api.POST(request({ templateId: "tpl-2" }))).status, 404);
    assert.equal((await api.POST(request({ templateId: template.id, variables: { nombre: "{{otro}}", pedido: "P-100" } }))).status, 422);
    assert.equal((await api.POST(new Request("http://localhost", { method: "POST", headers: { "x-internal-api-key": "test-internal" }, body: "{" }))).status, 400);
  });
  await t.test("envía texto revisado a n8n, guarda origen y conserva metadatos al fallar", async () => {
    const selection = { id: template.id, updatedAt: template.updatedAt.toISOString(), values: { nombre: "María", pedido: "P-100" } };
    const content = "Hola María, pedido P-100. Gracias.";
    const input = { content, type: "TEXT" as const, requestId: "550e8400-e29b-41d4-a716-446655440000", template: selection };
    await messagesService.sendInternalMessage("conversation-1", input, "agent-1");
    assert.equal(outboundBody.content, content);
    assert.equal(outboundBody.type, "text");
    assert.equal((outboundBody.template as Record<string, unknown>).edited, true);
    assert.equal(messages[0].status, "sent");
    assert.deepEqual((messages[0].metadata as Record<string, unknown>).template, outboundBody.template);
    rejectOutbound = true;
    await assert.rejects(messagesService.sendInternalMessage("conversation-1", input, "agent-1"));
    assert.equal(messages[1].status, "failed");
    assert.equal(((messages[1].metadata as Record<string, unknown>).template as Record<string, unknown>).id, template.id);
    rejectOutbound = false;
    const before = outboundCalls;
    await assert.rejects(messagesService.sendInternalMessage("conversation-1", { ...input, template: { ...selection, values: {} } }, "agent-1"));
    await assert.rejects(messagesService.sendInternalMessage("conversation-1", { ...input, template: { ...selection, updatedAt: "2020-01-01T00:00:00.000Z" } }, "agent-1"));
    await assert.rejects(messagesService.sendInternalMessage("conversation-1", { ...input, content: "Hola {{nombre}}" }, "agent-1"));
    records.get(template.id)!.isActive = false;
    await assert.rejects(messagesService.sendInternalMessage("conversation-1", input, "agent-1"));
    records.get(template.id)!.isActive = true;
    assert.equal(outboundCalls, before);
  });
  await t.test("el callback del bot conserva la plantilla que n8n utilizó", async () => {
    const snapshot = outboundBody.template;
    const result = await outgoingApi.POST(request({ conversationId: "conversation-1", content: "Hola María, pedido P-100.", template: snapshot, requestId: "bot-request-1" }));
    assert.equal(result.status, 200);
    assert.equal(messages[2].senderType, "BOT");
    assert.deepEqual((messages[2].metadata as Record<string, unknown>).template, snapshot);
    const failed = await outgoingApi.POST(request({ conversationId: "conversation-1", content: "Hola María", template: snapshot, requestId: "bot-request-2", status: "failed" }));
    assert.equal(failed.status, 200);
    assert.equal(messages[3].status, "failed");
    assert.equal((messages[3].metadata as Record<string, unknown>).errorCode, "SAVED_REPLY_SEND_FAILED");
  });
});
