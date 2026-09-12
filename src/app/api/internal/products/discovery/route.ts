import { NextResponse } from "next/server";
import { z } from "zod";
import { discoverSpeakerBrands } from "@/lib/product-discovery";

const schema = z.object({
  mode: z.enum(["BRANDS"]),
  query: z.string().trim().min(1).max(120),
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
