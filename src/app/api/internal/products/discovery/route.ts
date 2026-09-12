import { NextResponse } from "next/server";
import { z } from "zod";
import { discoverExactProducts, discoverSpeakerBrands } from "@/lib/product-discovery";

const schema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("BRANDS"),
    query: z.string().trim().min(1).max(120),
  }),
  z.object({
    mode: z.literal("EXACT_PRODUCT"),
    brand: z.string().trim().min(1).max(120),
    model: z.string().trim().min(1).max(120),
  }),
]);

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

    if (input.mode === "EXACT_PRODUCT") {
      const result = await discoverExactProducts({
        brand: input.brand,
        model: input.model,
      });

      return NextResponse.json({
        ok: true,
        mode: input.mode,
        ...result,
      });
    }

    const brands = await discoverSpeakerBrands();

    return NextResponse.json({
      ok: true,
      mode: input.mode,
      query: input.query,
      count: brands.length,
      brands,
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

    console.error("[internal/products/discovery] error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Product discovery failed",
      },
      { status: 500 },
    );
  }
}
