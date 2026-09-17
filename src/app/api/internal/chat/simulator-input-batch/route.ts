import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { CHAT_QUIET_PERIOD_MS } from "@/lib/chat-input-batch";
import { lockSimulatorConversation, readSimulatorInputBatch } from "@/lib/simulator-input-batch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({ conversationId: z.string().min(1).max(191), triggerMessageId: z.string().min(1).max(191) });

export async function POST(request: Request) {
  if (!process.env.N8N_INTERNAL_API_KEY || request.headers.get("x-internal-api-key") !== process.env.N8N_INTERNAL_API_KEY) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const input = schema.parse(await request.json());
    const result = await prisma.$transaction(async tx => {
      await lockSimulatorConversation(tx, input.conversationId);
      const conversation = await tx.conversation.findUnique({ where: { id: input.conversationId }, select: {
        botEnabled: true, status: true, assignedUserId: true, contact: { select: { externalId: true } },
      } });
      if (!conversation?.contact.externalId?.startsWith("SIMULATOR:")) return { denied: true };
      if (!conversation.botEnabled || conversation.assignedUserId || conversation.status !== "AUTOMATICO") {
        return { batch: { status: "HUMAN_OWNS_CONVERSATION" } };
      }
      return { batch: await readSimulatorInputBatch(tx, input.conversationId, input.triggerMessageId) };
    });
    if ("denied" in result) return NextResponse.json({ ok: false, error: "Simulator conversation required" }, { status: 403 });
    return NextResponse.json({ ok: true, ...result, quietPeriodMs: CHAT_QUIET_PERIOD_MS });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ ok: false, error: "Invalid request payload" }, { status: 400 });
    console.error("[simulator-input-batch] failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ ok: false, error: "SIMULATOR_INPUT_BATCH_FAILED" }, { status: 500 });
  }
}
