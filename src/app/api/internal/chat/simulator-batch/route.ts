import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { triggerPusherEvent } from "@/lib/pusher-server";
import { greetChatResponse } from "@/lib/chat-greeting";
import { lockSimulatorConversation, readSimulatorInputBatch } from "@/lib/simulator-input-batch";
import { agendaSchema, emptyAgenda } from "@/lib/bc-request-agenda";
import { customerMemoryEnabled, lockCustomerMemory, persistCustomerLearning } from "@/lib/bc-customer-memory-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({
  conversationId: z.string().min(1).max(191),
  requestId: z.string().min(1).max(191),
  triggerMessageId: z.string().min(1).max(191).optional(),
  customerMemoryRevision: z.number().int().nonnegative().optional(),
  agenda: z.object({ expectedRevision: z.number().int().nonnegative(), state: agendaSchema }).optional(),
  inventory: z.array(z.object({ id: z.string(), updatedAt: z.string().datetime().optional(), stockUnits: z.number(), unitPrice: z.string(), wholesalePrice: z.string().nullable(), wholesaleMinQty: z.number() })).max(10000).optional(),
  selection: z.object({ code: z.string().max(64).nullable(), quantity: z.number().int().positive().nullable() }).optional(),
  messages: z.array(z.object({
    type: z.enum(["TEXT", "IMAGE", "DOCUMENT", "VIDEO"]),
    content: z.string().trim().min(1).max(4000),
    mediaUrl: z.string().url().nullable().optional(),
  }).refine(m => m.type === "TEXT" || Boolean(m.mediaUrl), "Media URL required")).min(1).max(100),
});

/** Persist the complete response atomically so simulator polling cannot stop after just its first image. */
export async function POST(request: Request) {
  if (!process.env.N8N_INTERNAL_API_KEY || request.headers.get("x-internal-api-key") !== process.env.N8N_INTERNAL_API_KEY) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const input = schema.parse(await request.json());
    const batchId = createHash("sha256").update(`${input.conversationId}:${input.requestId}`).digest("hex").slice(0,32);
    const result = await prisma.$transaction(async tx => {
      await lockSimulatorConversation(tx, input.conversationId);
      const conversation = await tx.conversation.findUnique({ where: { id: input.conversationId }, select: {
        botEnabled: true, assignedUserId: true, status: true, contactId: true, contact: { select: { externalId: true } },
        messages: { where: { direction: "OUTBOUND", senderType: { in: ["BOT", "AGENT"] }, OR: [{ status: null }, { status: { notIn: ["failed", "pending"] } }] }, select: { id: true }, take: 1 },
      } });
      if (!conversation?.contact.externalId?.startsWith("SIMULATOR:")) return { denied: true, messages: [] };
      if (!conversation.botEnabled || conversation.assignedUserId || conversation.status !== "AUTOMATICO") return { skipped: true, messages: [] };
      const existing = await tx.chatMessage.findUnique({ where: { externalMessageId: `simulated:${batchId}:0` } });
      if (existing) return { duplicate: true, messages: [] };
      const inputBatch = input.triggerMessageId
        ? await readSimulatorInputBatch(tx, input.conversationId, input.triggerMessageId) : null;
      if (inputBatch && inputBatch.status !== "READY" && inputBatch.status !== "TOO_LARGE") {
        return { skipped: true, reason: inputBatch.status, messages: [] };
      }
      let previousAgenda = emptyAgenda();
      if (input.agenda) {
        if (!input.triggerMessageId || inputBatch?.status !== "READY") return { skipped: true, reason: "AGENDA_REQUIRES_READY_BATCH", messages: [] };
        const previous = await tx.conversationRequestAgenda.findUnique({ where: { conversationId: input.conversationId } });
        if ((previous?.revision ?? 0) !== input.agenda.expectedRevision) return { skipped: true, reason: "AGENDA_CHANGED", messages: [] };
        previousAgenda = previous ? agendaSchema.parse(previous.state) : emptyAgenda();
      }
      if (input.inventory?.length) {
        const live = await tx.product.findMany({ where: { id: { in: input.inventory.map(product => product.id) }, isVisible: true },
          select: { id: true, updatedAt: true, stockUnits: true, unitPrice: true, wholesalePrice: true, wholesaleMinQty: true } });
        if (input.inventory.some(product => !live.some(row => row.id === product.id && (!product.updatedAt || row.updatedAt.toISOString() === product.updatedAt) && row.stockUnits === product.stockUnits && String(row.unitPrice) === product.unitPrice && (row.wholesalePrice === null ? null : String(row.wholesalePrice)) === product.wholesalePrice && row.wholesaleMinQty === product.wholesaleMinQty))) {
          return { skipped: true, reason: "INVENTORY_CHANGED", messages: [] };
        }
      }
      const started = Date.now();
      if (customerMemoryEnabled() && input.customerMemoryRevision !== undefined) {
        await lockCustomerMemory(tx, conversation.contactId);
        const memory = await tx.customerConversationMemory.findUnique({ where: { contactId: conversation.contactId } });
        if ((memory?.revision ?? 0) !== input.customerMemoryRevision) return { skipped: true, reason: "CUSTOMER_MEMORY_CHANGED", messages: [] };
      }
      const replies = conversation.messages?.length ? input.messages : greetChatResponse(input.messages, new Date(started));
      const data = replies.map((message,index) => ({
        conversationId: input.conversationId, senderType: "BOT" as const, direction: "OUTBOUND" as const,
        messageType: message.type, content: message.content, mediaUrl: message.mediaUrl ?? null, status: "sent",
        externalMessageId: `simulated:${batchId}:${index}`, createdAt: new Date(started + index),
        metadata: { agentId: "bc-simulator", requestId: input.requestId, batchId, batchSize: replies.length, batchIndex: index,
          ...(input.triggerMessageId ? { triggerMessageId: input.triggerMessageId } : {}),
          ...(inputBatch && "messageIds" in inputBatch ? { sourceMessageIds: inputBatch.messageIds } : {}) },
      }));
      const inserted = await tx.chatMessage.createMany({ data, skipDuplicates: true });
      if (!inserted.count) return { duplicate: true, messages: [] };
      if (input.agenda) {
        if (customerMemoryEnabled() && inputBatch?.status === "READY") {
          await persistCustomerLearning(tx, { contactId: conversation.contactId, conversationId: input.conversationId,
            previous: previousAgenda, next: input.agenda.state, messages: inputBatch.fragments });
        }
        await tx.conversationRequestAgenda.upsert({
          where: { conversationId: input.conversationId },
          create: { conversationId: input.conversationId, revision: 1, state: input.agenda.state },
          update: { revision: { increment: 1 }, state: input.agenda.state },
        });
      }
      if (input.selection && input.agenda) {
        const selected = input.agenda.state.topics.find(topic => topic.id === input.agenda!.state.lastTopicId)?.selectedCode;
        if (selected === input.selection.code) {
          const state = await tx.conversationSalesState.findUnique({ where: { conversationId: input.conversationId }, select: { stage: true, selectedProductCode: true } });
          // Keep checkout/customer/payment state intact while sharing an explicitly resolved SKU.
          const sameSelection = Boolean(selected) && state?.selectedProductCode === selected;
          if (!sameSelection && (!state || !/CUSTOMER|DOCUMENT|DELIVERY|ORDER|PAYMENT|COMPLETED/.test(state.stage))) {
            const data = { selectedProductCode: selected, quantity: selected ? input.selection.quantity : null, unitPrice: null, total: null, priceTier: null, stage: selected ? "AWAITING_PURCHASE_CONFIRMATION" as const : "AWAITING_PRODUCT_QUERY" as const };
            await tx.conversationSalesState.upsert({ where: { conversationId: input.conversationId }, create: { conversationId: input.conversationId, ...data }, update: data });
          }
        }
      }
      await tx.conversation.update({ where: { id: input.conversationId }, data: {
        lastMessageAt: data[data.length - 1].createdAt, unreadCount: { increment: inserted.count },
      } });
      const messages = await tx.chatMessage.findMany({ where: { externalMessageId: { in: data.map(m => m.externalMessageId) } }, orderBy: { createdAt: "asc" } });
      return { messages };
    });
    if ("denied" in result) return NextResponse.json({ ok: false, error: "Simulator conversation required" }, { status: 403 });
    for (const message of result.messages) triggerPusherEvent(`chat-${input.conversationId}`, "new-message", message);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ ok: false, error: "Invalid request payload" }, { status: 400 });
    console.error("[simulator-batch] failed", error instanceof Error ? error.name : "UnknownError", error && typeof error === "object" && "code" in error ? String(error.code) : "");
    return NextResponse.json({ ok: false, error: "SIMULATOR_BATCH_FAILED" }, { status: 500 });
  }
}
