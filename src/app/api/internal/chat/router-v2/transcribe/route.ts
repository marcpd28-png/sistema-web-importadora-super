import { NextResponse } from "next/server";
import { z } from "zod";

import { transcribeRouterV2Audio } from "@/lib/router-v2-audio-transcriber";

const schema = z.object({
  audioDataUrl: z.string().trim().min(1).max(30_000_000),
  language: z.string().trim().max(20).nullable().optional(),
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
    const transcription = await transcribeRouterV2Audio(input);

    return NextResponse.json({
      ok: true,
      transcription,
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

    console.error("[router-v2-transcribe] error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
