import type { Channel, Prisma } from "@prisma/client";

/**
 * A controlled error for the advisor-workspace ownership boundary.  Routes use
 * its status code instead of exposing whether another advisor owns a chat.
 */
export class ConversationAssignmentError extends Error {
  constructor(message: string, public readonly statusCode: 404 | 409 = 404) {
    super(message);
    this.name = "ConversationAssignmentError";
  }
}

/** Channels an advisor can work from the shared message center. */
export function isAdvisorSupportedChannel(channel: Channel) {
  return channel === "TELEGRAM" || channel === "WHATSAPP";
}

/**
 * Advisors may see work that is still in the shared queue, plus the chats
 * they own.  They never receive another advisor's records in the list.
 */
export function advisorConversationScope(advisorId: string): Prisma.ConversationWhereInput {
  return {
    OR: [
      { assignedUserId: null },
      { assignedUserId: advisorId },
    ],
  };
}

export function isConversationAssignedToAdvisor(
  assignedUserId: string | null,
  advisorId: string,
) {
  // An unassigned conversation belongs to the shared advisor queue. A user
  // may open it in order to claim it; only another advisor's assignment is
  // private.
  return assignedUserId === null || assignedUserId === advisorId;
}

export function canTransferConversation({
  assignedUserId,
  actorId,
  isMessagingOwner,
}: {
  assignedUserId: string | null;
  actorId: string;
  isMessagingOwner: boolean;
}) {
  return isMessagingOwner || assignedUserId === actorId;
}
