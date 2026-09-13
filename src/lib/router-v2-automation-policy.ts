import type { ConversationState } from "@prisma/client";

export type RouterV2AutomationBlockReason =
  | "BOT_DISABLED"
  | "ASSIGNED_TO_HUMAN"
  | "CONVERSATION_NOT_AUTOMATIC";

export type RouterV2AutomationPolicy =
  | {
      allowed: true;
      reason: null;
    }
  | {
      allowed: false;
      reason: RouterV2AutomationBlockReason;
    };

export function evaluateRouterV2AutomationPolicy(input: {
  botEnabled: boolean;
  assignedUserId?: string | null;
  status: ConversationState;
}): RouterV2AutomationPolicy {
  if (!input.botEnabled) {
    return { allowed: false, reason: "BOT_DISABLED" };
  }

  if (input.assignedUserId) {
    return { allowed: false, reason: "ASSIGNED_TO_HUMAN" };
  }

  if (input.status !== "AUTOMATICO") {
    return {
      allowed: false,
      reason: "CONVERSATION_NOT_AUTOMATIC",
    };
  }

  return { allowed: true, reason: null };
}
