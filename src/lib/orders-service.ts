import { prisma } from "@/lib/prisma";
import { OrderStatus, Prisma } from "@prisma/client";

export async function getAdminOrders(input: { page: number; status: OrderStatus | "all" }) {
  const pageSize = 10;

  const where: Prisma.OrderWhereInput = {};
  if (input.status !== "all") {
    where.status = input.status;
  }

  const totalResults = await prisma.order.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  const page = Number.isSafeInteger(input.page) ? Math.min(totalPages, Math.max(1, input.page)) : 1;
  const orders = await prisma.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        items: true,
      },
    });

  const rawStats = await prisma.order.groupBy({
    by: ["status"],
    _count: true,
  });

  const stats = {
    all: 0,
    paid: 0,
    pending: 0,
    shipped: 0,
  };

  for (const row of rawStats) {
    stats.all += row._count;
    if (row.status === "PAID") stats.paid += row._count;
    if (row.status === "PENDING") stats.pending += row._count;
    if (row.status === "SHIPPED") stats.shipped += row._count;
  }

  return {
    orders: orders.map(o => {
       const itemCount = o.items.reduce((acc, i) => acc + i.quantity, 0);
       return { ...o, itemCount };
    }),
    totalResults,
    totalPages,
    page,
    pageSize,
    stats,
  };
}
