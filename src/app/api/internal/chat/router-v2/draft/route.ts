import { NextResponse } from "next/server";
import { z } from "zod";

import { draftRouterV2WithAi } from "@/lib/router-v2-ai-drafter";

type DraftInput = Parameters<typeof draftRouterV2WithAi>[0];

const schema = z.object({
  baseline: z.string().trim().min(1).max(12000),
  context: z.record(z.string(), z.unknown()),
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
    const result = await draftRouterV2WithAi({
      baseline: input.baseline,
      context: input.context as DraftInput["context"],
    });

    return NextResponse.json({
      ok: true,
      ...result,
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

    console.error("[router-v2-draft] error:", error);

    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
