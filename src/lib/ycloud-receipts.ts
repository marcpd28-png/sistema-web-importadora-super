import { PrismaClient } from "@prisma/client";
import { normalizeYCloudPhone } from "./ycloud-outbound";

const rank: Record<string, number> = { pending: 0, queued: 0, sending: 0, uncertain: 0, accepted: 1, sent: 2, delivered: 3, read: 4 };

/** externalId is assigned BEFORE delivery. An early callback must never be
 * interpreted as a human console message just because wamid is not saved yet. */
export async function recordYCloudReceipt(db: PrismaClient, input: { ids: string[]; externalId: string | null; recipient: string | null; status: string }) {
  const existing = await db.chatMessage.findFirst({ where: {
    direction: "OUTBOUND", OR: [
      { externalMessageId: { in: input.ids } },
      ...(input.externalId ? [{ id: input.externalId }] : []),
    ],
  }, include: { conversation: { include: { contact: true } }, rockyOutboundJob: true } });
  // An unknown business ID is an integration receipt, not evidence of a human.
  if (!existing) return Boolean(input.externalId);
  const contact = existing.conversation.contact;
  if (normalizeYCloudPhone(input.recipient) !== normalizeYCloudPhone(contact.phoneNormalized ?? contact.phone ?? contact.externalId)) return true;
  if (!(input.status in rank) && input.status !== "failed") return true;
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${existing.conversationId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "ChatMessage" WHERE id = ${existing.id} FOR UPDATE`;
    const current = await tx.chatMessage.findUniqueOrThrow({ where: { id: existing.id } });
    if (input.status === "failed" ? (rank[current.status ?? ""] ?? 0) >= 3 : (rank[current.status ?? ""] ?? 0) > rank[input.status]) return;
    await tx.chatMessage.update({ where: { id: existing.id }, data: {
      status: input.status, ...(current.externalMessageId ? {} : { externalMessageId: input.ids[0] }),
    } });
    const job = existing.rockyOutboundJob;
    if (job) {
      if (input.status === "failed") {
        await tx.conversation.updateMany({ where: { id: job.conversationId, automationRevision: job.conversationRevision, assignedUserId: null, botEnabled: true }, data: { botEnabled: false, status: "REQUIERE_ASESOR" } });
      }
      await tx.rockyOutboundJob.update({ where: { id: job.id }, data: {
        state: input.status === "failed" ? "failed" : "submitted", finishedAt: new Date(),
        reason: input.status === "failed" ? "provider_confirmed_failure" : null,
      } });
    }
  });
  return true;
}
