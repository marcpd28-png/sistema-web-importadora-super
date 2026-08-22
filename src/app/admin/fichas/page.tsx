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

  const [products, total] = await Promise.all([
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
  ]);

  const productsWithStats = await Promise.all(
    products.map(async (p) => {
      const [scans, last7Days, videoPlays, cartAdds, whatsappClicks] = await Promise.all([
        prisma.qrAnalyticsLog.count({ where: { productId: p.id, eventType: "QR_OPEN" } }),
        prisma.qrAnalyticsLog.count({
          where: {
            productId: p.id,
            eventType: "QR_OPEN",
            timestamp: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        }),
        prisma.qrAnalyticsLog.count({ where: { productId: p.id, eventType: "VIDEO_PLAY" } }),
        prisma.qrAnalyticsLog.count({ where: { productId: p.id, eventType: "ADD_TO_CART_FROM_QR" } }),
        prisma.qrAnalyticsLog.count({ where: { productId: p.id, eventType: "WHATSAPP_FROM_QR" } }),
      ]);

      return {
        ...p,
        stats: {
          scans,
          last7Days,
          videoPlays,
          cartAdds,
          whatsappClicks,
        },
      };
    })
  );

  return (
    <FichasListWorkspace
      products={productsWithStats}
      total={total}
      page={page}
      pageSize={pageSize}
      filters={{ q, profileStatus }}
    />
  );
}
