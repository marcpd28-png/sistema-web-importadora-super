import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const route = readFileSync(
  new URL("../app/api/admin/conversations/[id]/typing/route.ts", import.meta.url),
  "utf8",
);
const workspace = readFileSync(
  new URL("../components/admin/messages/MessagesWorkspace.tsx", import.meta.url),
  "utf8",
);
const input = readFileSync(
  new URL("../components/admin/messages/MessageInput.tsx", import.meta.url),
  "utf8",
);

test("el lease de escritura está autenticado, limitado al asesor y no toma el chat", () => {
  assert.match(route, /getMessageCenterSession/);
  assert.match(route, /hasSameOrigin\(request\)/);
  assert.match(route, /isAdvisorConversationAccessible\(id, session\.userId\)/);
  assert.match(route, /conversation\.channel !== "TELEGRAM"/);
  assert.match(route, /typing && \(!conversation\.botEnabled \|\| conversation\.status !== "AUTOMATICO"\)/);
  assert.match(route, /telegramCommand<\{ typingUntil\?: number \| null \}>\("typing"/);
  assert.match(route, /leaseSeconds: 8/);
  assert.match(route, /sender: "AGENT"/);
  assert.doesNotMatch(route, /updateConversation\(|controlTelegram\(/);
});

test("la interfaz renueva solo cuando el asesor sigue escribiendo y la libera al salir", () => {
  assert.match(workspace, /const TYPING_LEASE_INPUT_THROTTLE_MS = 3000/);
  assert.match(workspace, /now - current\.lastRenewedAt < TYPING_LEASE_INPUT_THROTTLE_MS/);
  assert.doesNotMatch(workspace, /setInterval\([^\n]*typing/i);
  assert.match(workspace, /updateTypingLease\(activeId, false\)/);
  assert.match(input, /onDraftActivity\?\.\(Boolean\(nextMessage\.trim\(\)\)\)/);
  assert.match(input, /onBlur=\{\(\) => onDraftActivity\?\.\(false\)\}/);
  assert.match(input, /onDraftActivity\?\.\(false\);\n    if \(attachment\)/);
  assert.match(input, /draftActivityRef\.current\?\.\(false\)/);
});
