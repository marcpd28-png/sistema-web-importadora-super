import { NextResponse } from "next/server";
import { z } from "zod";
import { answerShopAssistant } from "@/lib/shop-assistant";

const schema = z.object({
  query: z.string().trim().min(1).max(280),
  limit: z.number().int().min(1).max(10).default(4),
  contextCategorySlug: z.string().trim().nullable().optional(),
  productContextCode: z.string().trim().nullable().optional(),
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

    const reply = await answerShopAssistant({
      message: input.query,
      productContextCode: input.productContextCode ?? null,
      contextCategorySlug: input.contextCategorySlug ?? null,
      recentMessages: [],
    });

    const products = (reply.products ?? []).slice(0, input.limit);

    return NextResponse.json({
      ok: true,
      query: input.query,
      count: products.length,
      products,
      assistantText: reply.text,
      quickActions: reply.quickActions,
      suggestedPrompts: reply.suggestedPrompts,
      contextProductCode: reply.contextProductCode,
      contextCategorySlug: reply.contextCategorySlug,
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

    console.error("[internal/products/search] error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Product search failed",
      },
      { status: 500 },
    );
  }
}
