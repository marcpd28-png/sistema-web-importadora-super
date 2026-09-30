import type { Prisma } from "@prisma/client";

export const ROCKY_QUIET_PERIOD_MS = 10_000;
export const ROCKY_INPUT_TTL_MS = 15 * 60_000;

/** Called inside the same transaction as the customer message. The caller
 * locks settings before the conversation, as does the outbound dispatcher. */
export async function scheduleRockyTurn(tx: Prisma.TransactionClient, conversationId: string, triggerMessageId: string, now = new Date()) {
  const conversation = await tx.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { contact: true } });
  const settings = await tx.storeSettings.findUnique({ where: { id: 1 } });
  const allowed = settings?.botMasterSwitch && conversation.botEnabled && !conversation.assignedUserId &&
    conversation.status === "AUTOMATICO" && !conversation.contact.externalId?.startsWith("SIMULATOR:");
  const previous = await tx.rockyInboundTurn.findUnique({ where: { conversationId } });
  const alreadyDispatched = previous ? await tx.rockyOutboundJob.count({ where: { conversationId, inboundVersion: previous.version, state: { in: ["sending", "submitted", "uncertain", "failed"] } } }) : 0;
  const continueBatch = previous && previous.expiresAt > now && !alreadyDispatched &&
    ["pending", "running", "done"].includes(previous.state) && previous.conversationRevision === conversation.automationRevision &&
    previous.globalRevision === settings?.automationRevision;
  const data = {
    triggerMessageId, conversationRevision: conversation.automationRevision, globalRevision: settings?.automationRevision ?? -1,
    messageIds: [...(continueBatch ? previous.messageIds : []), triggerMessageId],
    dueAt: new Date(now.getTime() + ROCKY_QUIET_PERIOD_MS), expiresAt: new Date(now.getTime() + ROCKY_INPUT_TTL_MS),
    state: allowed ? "pending" : "cancelled", reason: allowed ? null : "automation_disabled_at_receipt", attempts: 0, processingToken: null,
  };
  await tx.rockyInboundTurn.upsert({ where: { conversationId }, create: { conversationId, ...data }, update: { ...data, version: { increment: 1 } } });
  // No stale queued reply may overtake the newly received fragment.
  const stale = await tx.rockyOutboundJob.findMany({ where: { conversationId, state: "queued" }, select: { messageId: true } });
  await tx.rockyOutboundJob.updateMany({ where: { conversationId, state: "queued" }, data: { state: "cancelled", reason: "new_customer_fragment", finishedAt: now } });
  await tx.chatMessage.updateMany({ where: { id: { in: stale.map(job => job.messageId) } }, data: { status: "cancelled" } });
}
