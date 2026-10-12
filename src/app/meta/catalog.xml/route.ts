import { prisma } from "@/lib/prisma";
import { buildMetaCatalogFeed } from "@/lib/meta-catalog-feed";
import { buildRealProductPhotoWhere } from "@/lib/product-photo-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public scheduled feed for Meta Commerce Manager.
 *
 * Add https://tiendavirtualsuper.com/meta/catalog.xml as a scheduled feed in
 * Commerce Manager. Only visible, in-stock products with a real image are
 * emitted, so Meta does not ingest incomplete or unavailable listings.
 */
export async function GET() {
  const products = await prisma.product.findMany({
    where: {
      isVisible: true,
      stockUnits: { gt: 0 },
      AND: [buildRealProductPhotoWhere()],
    },
    select: {
      code: true,
      slug: true,
      name: true,
      description: true,
      technicalSpecs: true,
      brand: true,
      category: true,
      unitPrice: true,
      wholesalePrice: true,
      stockUnits: true,
      localImageUrl: true,
      imageUrl: true,
      media: {
        select: { url: true, type: true },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { code: "asc" },
  });

  return new Response(buildMetaCatalogFeed(products), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=900, s-maxage=900",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
