import type { Prisma } from "@prisma/client";
import type { RequestAgenda } from "./bc-request-agenda";
import { learnCustomerMemory, readCustomerMemory } from "./bc-customer-memory";

export function customerMemoryEnabled() {
  return process.env.BC_CUSTOMER_MEMORY_ENABLED === "true";
}

export async function lockCustomerMemory(tx: Prisma.TransactionClient, contactId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`customer-memory:${contactId}`}))`;
}

export async function persistCustomerLearning(tx: Prisma.TransactionClient, input: {
  contactId: string; conversationId: string; previous: RequestAgenda; next: RequestAgenda;
  messages: { messageId: string; content: string }[];
}) {
  // All writers lock by customer so concurrent sessions cannot overwrite each other's learning.
  await lockCustomerMemory(tx, input.contactId);
  const stored = await tx.customerConversationMemory.findUnique({ where: { contactId: input.contactId } });
  const state = learnCustomerMemory({ ...input, memory: readCustomerMemory(stored?.state) });
  await tx.customerConversationMemory.upsert({ where: { contactId: input.contactId },
    create: { contactId: input.contactId, revision: 1, state }, update: { revision: { increment: 1 }, state } });
}
