import type { Channel, Prisma } from "@prisma/client";

/**
 * Advisors work the supported commercial inbox only. WhatsApp remains in the
 * administrator workspace so a hidden filter can never become a bypass.
 */
export const ADVISOR_MESSAGE_CHANNEL: Channel = "TELEGRAM";

export function isAdvisorSupportedChannel(channel: Channel) {
  return channel === ADVISOR_MESSAGE_CHANNEL;
}

/**
 * A controlled error for the advisor-workspace ownership boundary. Routes use
 * its status code instead of revealing another advisor's conversation.
 */
export class ConversationAssignmentError extends Error {
  constructor(message: string, public readonly statusCode: 404 | 409 = 404) {
    super(message);
    this.name = "ConversationAssignmentError";
  }
}

/**
 * An advisor sees the shared queue plus only the chats they already own.
 */
export function advisorConversationScope(advisorId: string): Prisma.ConversationWhereInput {
  return {
    AND: [
      { channel: ADVISOR_MESSAGE_CHANNEL },
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
