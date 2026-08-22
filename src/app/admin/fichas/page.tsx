import { prisma } from "@/lib/prisma";
import { FichasListWorkspace } from "@/components/admin/fichas-list-workspace";

export const dynamic = "force-dynamic";

type FichasPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function FichasPage({ searchParams }: FichasPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const q = typeof params?.q === "string" ? params.q.trim() : "";
  const profileStatus = typeof params?.profileStatus === "string" ? params.profileStatus : "all";
  const pageStr = typeof params?.page === "string" ? params.page : "1";
  const page = Number.isNaN(Number(pageStr)) ? 1 : Math.max(1, Number(pageStr));
  const pageSize = 15;
  const skip = (page - 1) * pageSize;

  const where: any = {};

  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
    ];
  }

  if (profileStatus === "published") {
    where.digitalProfile = { status: "PUBLICADA" };
  } else if (profileStatus === "draft") {
    where.digitalProfile = { status: "BORRADOR" };
  } else if (profileStatus === "missing") {
    where.digitalProfile = null;
  }

  const [
    products,
    total,
    globalPublishedCount,
    globalTotalProducts,
    globalTotalScans,
    globalTotalPlays
  ] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip,
      take: pageSize,
      include: {
        digitalProfile: true,
        qr: true,
        _count: {
          select: {
            specifications: true,
            variants: true,
            videos: true,
            documents: true,
          },
        },
      },
    }),
    prisma.product.count({ where }),
    prisma.digitalProductProfile.count({ where: { status: "PUBLICADA" } }),
    prisma.product.count(),
    prisma.qrAnalyticsLog.count({ where: { eventType: "QR_OPEN" } }),
    prisma.qrAnalyticsLog.count({ where: { eventType: "VIDEO_PLAY" } }),
  ]);

  const productIds = products.map((p) => p.id);

  const [allLogsCount, last7DaysScans] = await Promise.all([
    prisma.qrAnalyticsLog.groupBy({
      by: ["productId", "eventType"],
      where: { productId: { in: productIds } },
      _count: { _all: true },
    }),
    prisma.qrAnalyticsLog.groupBy({
      by: ["productId"],
      where: {
        productId: { in: productIds },
        eventType: "QR_OPEN",
        timestamp: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      _count: { _all: true },
    }),
  ]);

  const countsMap = new Map<string, Record<string, number>>();
  const last7DaysMap = new Map<string, number>();

  allLogsCount.forEach((item) => {
    if (!countsMap.has(item.productId)) {
      countsMap.set(item.productId, {
        QR_OPEN: 0,
        VIDEO_PLAY: 0,
        ADD_TO_CART_FROM_QR: 0,
        WHATSAPP_FROM_QR: 0,
      });
    }
    const productCounts = countsMap.get(item.productId)!;
    productCounts[item.eventType] = item._count._all;
  });

  last7DaysScans.forEach((item) => {
    last7DaysMap.set(item.productId, item._count._all);
  });

  const productsWithStats = products.map((p) => {
    const pCounts = countsMap.get(p.id) || {
      QR_OPEN: 0,
      VIDEO_PLAY: 0,
      ADD_TO_CART_FROM_QR: 0,
      WHATSAPP_FROM_QR: 0,
    };
    return {
      ...p,
      stats: {
        scans: pCounts.QR_OPEN || 0,
        last7Days: last7DaysMap.get(p.id) || 0,
        videoPlays: pCounts.VIDEO_PLAY || 0,
        cartAdds: pCounts.ADD_TO_CART_FROM_QR || 0,
        whatsappClicks: pCounts.WHATSAPP_FROM_QR || 0,
      },
    };
  });

  return (
    <FichasListWorkspace
      products={productsWithStats}
      total={total}
      page={page}
      pageSize={pageSize}
      filters={{ q, profileStatus }}
      globalStats={{
        totalPublished: globalPublishedCount,
        totalProducts: globalTotalProducts,
        totalScans: globalTotalScans,
        totalPlays: globalTotalPlays,
      }}
    />
  );
}
