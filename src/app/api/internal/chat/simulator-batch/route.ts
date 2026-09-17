import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { triggerPusherEvent } from "@/lib/pusher-server";
import { greetChatResponse } from "@/lib/chat-greeting";
import { lockSimulatorConversation, readSimulatorInputBatch } from "@/lib/simulator-input-batch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({
  conversationId: z.string().min(1).max(191),
  requestId: z.string().min(1).max(191),
  triggerMessageId: z.string().min(1).max(191).optional(),
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
        botEnabled: true, assignedUserId: true, status: true, contact: { select: { externalId: true } },
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
      const started = Date.now();
      const replies = greetChatResponse(input.messages, new Date(started));
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
    console.error("[simulator-batch] failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ ok: false, error: "SIMULATOR_BATCH_FAILED" }, { status: 500 });
  }
}
