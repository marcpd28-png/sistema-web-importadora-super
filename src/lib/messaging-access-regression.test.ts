import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const ownerOnlyHandlers = [
  "../app/api/admin/conversations/simulate/route.ts",
  "../app/api/admin/social/[channel]/route.ts",
  "../app/api/admin/social/[channel]/uploads/route.ts",
];

const advisorInboxHandlers = [
  "../app/api/admin/conversations/route.ts",
  "../app/api/admin/conversations/[id]/route.ts",
  "../app/api/admin/conversations/[id]/messages/route.ts",
  "../app/api/admin/messages/[id]/media/route.ts",
];

const assignmentHandler = "../app/api/admin/conversations/[id]/assignment/route.ts";

test("los controles sensibles de mensajería continúan bajo el guard de administrador", () => {
  for (const path of ownerOnlyHandlers) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /getMessagingOwnerSession/);
    assert.match(source, /status:\s*403/);
  }
});

test("la reactivación de Messenger es manual y conserva los controles de acceso", () => {
  const handler = readFileSync(new URL("../app/api/admin/social/[channel]/route.ts", import.meta.url), "utf8");
  const patchHandler = handler.slice(handler.indexOf("export async function PATCH"));
  const inbox = readFileSync(new URL("../components/admin/messages/SocialInbox.tsx", import.meta.url), "utf8");

  assert.match(patchHandler, /getMessagingOwnerSession/);
  assert.match(patchHandler, /sameOrigin\(request\)/);
  assert.match(patchHandler, /enableSocialBot/);
  assert.match(inbox, /method: "PATCH"/);
  assert.match(inbox, /Reactivar Super Bot/);
  assert.match(inbox, /no lo reactiva automáticamente/);
});

test("Super Bot es el único motor local publicable desde el centro de mensajes", () => {
  const removed = [
    "../app/api/admin/automations/route.ts",
    "../app/api/admin/automations/[id]/route.ts",
    "../app/api/admin/automations/[id]/publish/route.ts",
    "../app/api/webhook/n8n/execution-status/route.ts",
    "../app/admin/mensajes/automatizaciones/page.tsx",
    "../lib/automations/n8n-provider.ts",
  ];

  for (const path of removed) {
    assert.equal(existsSync(new URL(path, import.meta.url)), false, `${path} no debe reintroducir otro motor`);
  }

  const sidebar = readFileSync(new URL("../components/admin/messages/layout/MessagesSidebar.tsx", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
  assert.doesNotMatch(sidebar, /Automatizaciones|n8n/i);
  assert.doesNotMatch(schema, /n8nWebhookUrl|model Automation\b|automationRevision/);
});

test("la bandeja autorizada permite asesores sin abrir controles sensibles", () => {
  for (const path of advisorInboxHandlers) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /getMessageCenterSession/);
    assert.match(source, /status:\s*403/);
  }

  const advisorLayout = readFileSync(new URL("../app/asesor/mensajes/layout.tsx", import.meta.url), "utf8");
  const advisorInbox = readFileSync(new URL("../app/asesor/mensajes/page.tsx", import.meta.url), "utf8");
  assert.match(advisorLayout, /requireAdvisor/);
  assert.match(advisorInbox, /canManageBot=\{false\}/);
});

test("un asesor no puede usar IDs para entrar a conversaciones de simulación", () => {
  for (const path of advisorInboxHandlers.slice(1)) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /isAdvisorConversationAccessible/);
  }

  const service = readFileSync(new URL("./messages-service.ts", import.meta.url), "utf8");
  const simulationGuard = service.indexOf('conversation.contact.externalId?.startsWith("SIMULATOR:")');
  const transportDispatch = service.indexOf("return sendTelegramMessage");

  assert.ok(simulationGuard >= 0, "el envío debe rechazar los contactos de simulación");
  assert.ok(transportDispatch >= 0, "el servicio delega únicamente al transporte conectado");
  assert.ok(simulationGuard < transportDispatch, "el rechazo debe ocurrir antes de llegar al transporte");
});

test("la exclusividad de la bandeja se aplica al listado, lectura y envío", () => {
  const list = readFileSync(new URL("../app/api/admin/conversations/route.ts", import.meta.url), "utf8");
  const detail = readFileSync(new URL("../app/api/admin/conversations/[id]/route.ts", import.meta.url), "utf8");
  const messages = readFileSync(new URL("../app/api/admin/conversations/[id]/messages/route.ts", import.meta.url), "utf8");
  const service = readFileSync(new URL("./messages-service.ts", import.meta.url), "utf8");
  const telegram = readFileSync(new URL("./telegram-messages.ts", import.meta.url), "utf8");

  assert.match(list, /advisorId:\s*session\.userId/);
  assert.match(service, /advisorConversationScope\(scope\.advisorId\)/);
  assert.match(detail, /isAdvisorConversationAccessible\(id, session\.userId\)/);
  assert.match(messages, /isAdvisorConversationAccessible\(id, session\.userId\)/);
  assert.match(messages, /expectedAssigneeId:\s*session\.userId/);
  assert.match(service, /options\.expectedAssigneeId/);
  assert.match(telegram, /assignedUserId:\s*expectedAssigneeId/);
});

test("la toma y derivación usan una ruta controlada por el propietario actual", () => {
  const assignment = readFileSync(new URL(assignmentHandler, import.meta.url), "utf8");
  const service = readFileSync(new URL("./messages-service.ts", import.meta.url), "utf8");

  assert.match(assignment, /getMessageCenterSession/);
  assert.match(assignment, /claimConversation/);
  assert.match(assignment, /transferConversation/);
  assert.match(assignment, /canReassign:\s*isMessagingOwner/);
  assert.match(service, /canTransferConversation/);
  assert.match(service, /status:\s*\{ in: \["pending", "sending"\] \}/);
  assert.match(service, /unreadCount:\s*Math\.max\(existing\.unreadCount, 1\)/);
});

test("la interfaz reserva el centro de mensajes para perfiles con acceso administrativo", () => {
  const messagesLayout = readFileSync(new URL("../app/admin/mensajes/layout.tsx", import.meta.url), "utf8");
  const adminNav = readFileSync(new URL("../components/admin/admin-nav.tsx", import.meta.url), "utf8");
  const mobileDock = readFileSync(new URL("../components/admin/admin-sidebar.tsx", import.meta.url), "utf8");

  assert.match(messagesLayout, /requireMessagingOwner/);
  assert.match(adminNav, /requiresMessagingAccess/);
  assert.match(mobileDock, /requiresMessagingAccess/);
});

test("los paneles administrativo y asesor ofrecen una bandeja de consulta de WhatsApp", () => {
  const adminNav = readFileSync(new URL("../components/admin/admin-nav.tsx", import.meta.url), "utf8");
  const advisorNav = readFileSync(new URL("../components/advisor/advisor-nav.tsx", import.meta.url), "utf8");
  const adminPage = readFileSync(new URL("../app/admin/mensajes/whatsapp/page.tsx", import.meta.url), "utf8");
  const advisorPage = readFileSync(new URL("../app/asesor/mensajes/whatsapp/page.tsx", import.meta.url), "utf8");

  assert.match(adminNav, /href: "\/admin\/mensajes\/whatsapp"/);
  assert.match(advisorNav, /href: "\/asesor\/mensajes\/whatsapp"/);
  assert.match(adminPage, /initialChannel="WHATSAPP"/);
  assert.match(advisorPage, /initialChannel="WHATSAPP"/);
  assert.match(adminPage, /readOnly/);
  assert.match(advisorPage, /readOnly/);
});

test("el layout asesor mantiene serializables las props del componente cliente", () => {
  const advisorLayout = readFileSync(new URL("../app/asesor/layout.tsx", import.meta.url), "utf8");
  const mobileDock = readFileSync(new URL("../components/admin/admin-sidebar.tsx", import.meta.url), "utf8");

  assert.match(advisorLayout, /<AdminSidebar mobileLabel="Asesor" variant="advisor">/);
  assert.doesNotMatch(advisorLayout, /destinations=/);
  assert.match(mobileDock, /const advisorDestinations/);
  assert.match(mobileDock, /variant === "advisor" \? advisorDestinations : defaultDestinations/);
});
