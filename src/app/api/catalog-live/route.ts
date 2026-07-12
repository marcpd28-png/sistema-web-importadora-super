import { mapProduct } from "@/lib/store-shared";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

async function getCatalogVersion() {
  const latestProduct = await prisma.product.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });

  return latestProduct?.updatedAt.toISOString() ?? "empty";
}

export async function GET() {
  return Response.json(
    { version: await getCatalogVersion() },
    { headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { message: "Solicitud inválida." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const rawCodes =
    payload &&
    typeof payload === "object" &&
    "codes" in payload &&
    Array.isArray(payload.codes)
      ? payload.codes
      : [];
  const codes = Array.from(
    new Set(
      rawCodes
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 100),
    ),
  );
  const products = codes.length
    ? await prisma.product.findMany({
        where: { code: { in: codes } },
        include: {
          media: {
            orderBy: { sortOrder: "asc" },
          },
        },
      })
    : [];

  return Response.json(
    {
      products: products.map(mapProduct),
      version: await getCatalogVersion(),
    },
    { headers: NO_STORE_HEADERS },
  );
}
