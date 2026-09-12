import { NextResponse } from "next/server";
import { z } from "zod";

import { analyzeRouterV2ProductImage } from "@/lib/router-v2-vision-analyzer";

const schema = z.object({
  imageUrl: z.string().trim().min(1).max(25_000_000),
  customerMessage: z.string().max(5000).nullable().optional(),
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
    const analysis = await analyzeRouterV2ProductImage(input);

    return NextResponse.json({
      ok: true,
      analysis,
      visualHints:
        analysis.status === "READY" ? analysis.hints : null,
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

    console.error("[router-v2-vision] error:", error);

    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
