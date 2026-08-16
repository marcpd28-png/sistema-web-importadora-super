import { prisma } from "@/lib/prisma";

export type AdminNavBadges = {
  pendingQuotesCount: number;
  lowStockProductsCount: number;
  newComplaintsCount: number;
};

export async function getAdminNavBadges(): Promise<AdminNavBadges> {
  try {
    const [pendingQuotesCount, lowStockProductsCount, newComplaintsCount] = await Promise.all([
      prisma.quote.count({
        where: { status: "PENDING" },
      }),
      prisma.product.count({
        where: { stockUnits: { lte: 0 } },
      }),
      prisma.complaint.count({
        where: { status: { in: ["NEW", "IN_REVIEW"] } },
      }),
    ]);

    return {
      pendingQuotesCount,
      lowStockProductsCount,
      newComplaintsCount,
    };
  } catch (error) {
    console.error("Error fetching admin nav badges:", error);
    return {
      pendingQuotesCount: 0,
      lowStockProductsCount: 0,
      newComplaintsCount: 0,
    };
  }
}
