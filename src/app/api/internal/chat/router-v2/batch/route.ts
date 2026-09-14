import { NextResponse } from "next/server";
import { z } from "zod";

import { getRouterV2MessageBatch } from "@/lib/router-v2-message-batch";

const schema = z.object({
  conversationId: z.string().trim().min(1).max(191),
  triggerMessageId: z.string().trim().min(1).max(191),
  maxWindowMs: z.number().int().min(1000).max(60000).optional(),
});

function authorized(request: Request) {
  const expected = process.env.N8N_INTERNAL_API_KEY;
  return Boolean(
    expected && request.headers.get("x-internal-api-key") === expected,
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
    const batch = await getRouterV2MessageBatch(input);

    return NextResponse.json({
      ok: true,
      batch,
      recommendedWaitMs: 2500,
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

    console.error("[router-v2-batch] error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
