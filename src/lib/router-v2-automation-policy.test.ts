import assert from "node:assert/strict";
import test from "node:test";

import { evaluateRouterV2AutomationPolicy } from "@/lib/router-v2-automation-policy";

test("automation is allowed only for an unassigned automatic conversation", () => {
  assert.deepEqual(
    evaluateRouterV2AutomationPolicy({
      assignedUserId: null,
      botEnabled: true,
      status: "AUTOMATICO",
    }),
    { allowed: true, reason: null },
  );
});

test("a disabled bot always stops automatic replies", () => {
  assert.deepEqual(
    evaluateRouterV2AutomationPolicy({
      assignedUserId: null,
      botEnabled: false,
      status: "AUTOMATICO",
    }),
    { allowed: false, reason: "BOT_DISABLED" },
  );
});

test("an assigned human stops automatic replies", () => {
  assert.deepEqual(
    evaluateRouterV2AutomationPolicy({
      assignedUserId: "agent-1",
      botEnabled: true,
      status: "AUTOMATICO",
    }),
    { allowed: false, reason: "ASSIGNED_TO_HUMAN" },
  );
});

test("non-automatic conversation states stop automatic replies", () => {
  for (const status of [
    "REQUIERE_ASESOR",
    "ATENDIENDO",
    "ESPERANDO_CLIENTE",
    "CERRADO",
    "VENTA",
    "RECLAMO",
  ] as const) {
    assert.deepEqual(
      evaluateRouterV2AutomationPolicy({
        assignedUserId: null,
        botEnabled: true,
        status,
      }),
      { allowed: false, reason: "CONVERSATION_NOT_AUTOMATIC" },
    );
  }
});
