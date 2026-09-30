import { prisma } from "@/lib/prisma";
import { buildProductsNeedingPhotoWhere } from "@/lib/product-photo-policy";

export type AdminNavBadges = {
  pendingQuotesCount: number;
  lowStockProductsCount: number;
  newComplaintsCount: number;
  pendingOrdersCount: number;
  productsNeedingPhotoCount: number;
};

export async function getAdminNavBadges(): Promise<AdminNavBadges> {
  try {
    const [pendingQuotesCount, lowStockProductsCount, newComplaintsCount, pendingOrdersCount, productsNeedingPhotoCount] = await Promise.all([
      prisma.quote.count({
        where: { status: "PENDING" },
      }),
      prisma.product.count({
        where: { stockUnits: { lte: 0 } },
      }),
      prisma.complaint.count({
        where: { status: { in: ["NEW", "IN_REVIEW"] } },
      }),
      prisma.order.count({
        where: { status: "PENDING" },
      }),
      prisma.product.count({ where: buildProductsNeedingPhotoWhere() }),
    ]);

    return {
      pendingQuotesCount,
      lowStockProductsCount,
      newComplaintsCount,
      pendingOrdersCount,
      productsNeedingPhotoCount,
    };
  } catch (error) {
    console.error("Error fetching admin nav badges:", error);
    return {
      pendingQuotesCount: 0,
      lowStockProductsCount: 0,
      newComplaintsCount: 0,
      pendingOrdersCount: 0,
      productsNeedingPhotoCount: 0,
    };
  }
}
