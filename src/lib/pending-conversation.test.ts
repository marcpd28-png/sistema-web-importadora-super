import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { conversationInboxStatusFilter } from "./messages-service";

test("la bandeja principal excluye Pendientes y la vista Pendientes los solicita de forma explícita", () => {
  assert.deepEqual(conversationInboxStatusFilter(undefined), {
    status: { not: "REQUIERE_ASESOR" },
  });
  assert.deepEqual(conversationInboxStatusFilter("REQUIERE_ASESOR"), {
    status: "REQUIERE_ASESOR",
  });
});

test("administrador y asesor comparten la vista Pendientes", () => {
  const list = readFileSync(new URL("../components/admin/messages/ConversationList.tsx", import.meta.url), "utf8");
  const admin = readFileSync(new URL("../app/admin/mensajes/page.tsx", import.meta.url), "utf8");
  const advisor = readFileSync(new URL("../app/asesor/mensajes/page.tsx", import.meta.url), "utf8");
  const social = readFileSync(new URL("../components/admin/messages/SocialInbox.tsx", import.meta.url), "utf8");

  assert.match(list, /label: "Pendientes"/);
  assert.match(list, /status: "REQUIERE_ASESOR"/);
  assert.match(admin, /<MessagesWorkspace/);
  assert.match(advisor, /<MessagesWorkspace/);
  assert.match(social, />Pendientes</);
});
