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

/**
 * Historical WhatsApp rows remain in the database for audit purposes but no
 * longer have a connected transport.  The advisor workspace must never offer
 * those rows as work that can be claimed and answered.
 */
export function isAdvisorSupportedChannel(channel: Channel) {
  return channel === "TELEGRAM";
}

/**
 * Advisors may see Telegram work that is still in the shared queue, plus the
 * Telegram chats they own. They never receive another advisor's records.
 */
export function advisorConversationScope(advisorId: string): Prisma.ConversationWhereInput {
  return {
    AND: [
      { channel: "TELEGRAM" },
      {
        OR: [
          { assignedUserId: null },
          { assignedUserId: advisorId },
        ],
      },
    ],
  };
}

export function isConversationAssignedToAdvisor(
  assignedUserId: string | null,
  advisorId: string,
) {
  return assignedUserId === advisorId;
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
