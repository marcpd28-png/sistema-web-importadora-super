import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { analyzeRouterV2Message } from "@/lib/conversation-router-v2";
import { serializeSalesState } from "@/lib/conversation-sales-state";

const schema = z.object({
  conversationId: z.string().trim().min(1).max(191),
  content: z.string().max(10000).default(""),
  messageType: z.string().max(40).nullable().optional(),
  mediaUrl: z.string().nullable().optional(),
});

function authorized(request: Request) {
  const expected = process.env.N8N_INTERNAL_API_KEY;

  return Boolean(
    expected &&
      request.headers.get("x-internal-api-key") === expected,
  );
}

export async function POST(request: Request) {
  try {
    if (!authorized(request)) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const input = schema.parse(await request.json());

    const conversation = await prisma.conversation.findUnique({
      where: {
        id: input.conversationId,
      },
      select: {
        id: true,
        status: true,
        botEnabled: true,
        assignedUserId: true,
        salesState: true,
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { ok: false, error: "Conversation not found" },
        { status: 404 },
      );
    }

    const analysis = analyzeRouterV2Message({
      content: input.content,
      messageType: input.messageType,
      mediaUrl: input.mediaUrl,
    });

    const currentState = conversation.salesState
      ? serializeSalesState(conversation.salesState)
      : null;

    const mergedContext = {
      category:
        analysis.slots.category ??
        currentState?.category ??
        null,

      brand:
        analysis.slots.brand ??
        currentState?.brand ??
        null,

      selectedProductCode:
        currentState?.selectedProductCode ??
        null,

      quantity:
        analysis.slots.quantity ??
        currentState?.quantity ??
        null,

      customerCity:
        analysis.slots.customerCity ??
        null,

      deliveryMethod:
        analysis.slots.deliveryMethod ??
        null,

      purchaseIntent:
        analysis.slots.purchaseIntent ??
        false,

      mediaReference:
        analysis.slots.mediaReference ??
        false,
    };

    const nextAction =
      conversation.botEnabled === false
        ? "HUMAN_HANDOFF"
        : analysis.nextAction;

    return NextResponse.json({
      ok: true,

      conversation: {
        id: conversation.id,
        status: conversation.status,
        botEnabled: conversation.botEnabled,
        assignedUserId: conversation.assignedUserId,
      },

      currentState,
      analysis,
      mergedContext,
      nextAction,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid request payload",
          details: error.issues,
        },
        { status: 400 },
      );
    }

    console.error("[router-v2] error:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      },
      { status: 500 },
    );
  }
}
