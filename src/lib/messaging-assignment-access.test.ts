import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("la bandeja de asesores está limitada a la cola compartida y sus propios chats", () => {
  const list = read("../app/api/admin/conversations/route.ts");
  const detail = read("../app/api/admin/conversations/[id]/route.ts");
  const messages = read("../app/api/admin/conversations/[id]/messages/route.ts");
  const service = read("./messages-service.ts");

  assert.match(list, /advisorId:\s*session\.userId/);
  assert.match(service, /advisorConversationScope\(scope\.advisorId\)/);
  assert.match(detail, /isAdvisorConversationAccessible\(id, session\.userId\)/);
  assert.match(messages, /isAdvisorConversationAccessible\(id, session\.userId\)/);
  assert.match(messages, /expectedAssigneeId:\s*session\.userId/);
  assert.match(service, /assignedUserId:\s*options\.expectedAssigneeId/);
});

test("la toma y derivación usan una ruta protegida y el propietario actual", () => {
  const assignment = read("../app/api/admin/conversations/[id]/assignment/route.ts");
  const service = read("./messages-service.ts");

  assert.match(assignment, /getMessageCenterSession/);
  assert.match(assignment, /session\.role === "ADMIN"/);
  assert.match(assignment, /claimConversation/);
  assert.match(assignment, /transferConversation/);
  assert.match(service, /canTransferConversation/);
  assert.match(service, /status:\s*\{ in: \["pending", "sending"\] \}/);
});

test("los adjuntos respetan la misma propiedad de conversación", () => {
  const media = read("../app/api/admin/messages/[id]/media/route.ts");
  assert.match(media, /isAdvisorConversationAccessible\(message\.conversation\.id, session\.userId\)/);
});
