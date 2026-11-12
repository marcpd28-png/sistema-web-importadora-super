import assert from "node:assert/strict";
import test from "node:test";
import {
  advisorConversationScope,
  canTransferConversation,
  isAdvisorSupportedChannel,
  isConversationAssignedToAdvisor,
} from "./conversation-assignment";

test("la cola del asesor incluye chats libres y propios, nunca chats de otro asesor", () => {
  assert.deepEqual(advisorConversationScope("kimberly"), {
    OR: [
      { assignedUserId: null },
      { assignedUserId: "kimberly" },
    ],
  });
  assert.equal(isConversationAssignedToAdvisor(null, "kimberly"), true);
  assert.equal(isConversationAssignedToAdvisor("kimberly", "kimberly"), true);
  assert.equal(isConversationAssignedToAdvisor("candy", "kimberly"), false);
});

test("WhatsApp y Telegram son canales atendibles por asesores", () => {
  assert.equal(isAdvisorSupportedChannel("WHATSAPP"), true);
  assert.equal(isAdvisorSupportedChannel("TELEGRAM"), true);
  assert.equal(isAdvisorSupportedChannel("WEB"), false);
});

test("solo el dueño actual o Mark pueden transferir una conversación", () => {
  assert.equal(canTransferConversation({ assignedUserId: "kimberly", actorId: "kimberly", isMessagingOwner: false }), true);
  assert.equal(canTransferConversation({ assignedUserId: "kimberly", actorId: "candy", isMessagingOwner: false }), false);
  assert.equal(canTransferConversation({ assignedUserId: "kimberly", actorId: "mark", isMessagingOwner: true }), true);
  assert.equal(canTransferConversation({ assignedUserId: null, actorId: "kimberly", isMessagingOwner: false }), false);
});
