import "server-only";
import { prisma } from "./prisma";

export async function getStoreAnalyticsReport(days: number) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const inactive = new Date(end.getTime() - 1800000);
  const where = { createdAt: { gte: start, lte: end } };
  const [sessions, events, products, searches, sources, devices, orders] = await Promise.all([
    prisma.$queryRaw<Array<{ visits: bigint; carts: bigint; starts: bigint; quotes: bigint; abandoned: bigint }>>`
      WITH sessions AS (
        SELECT "sessionId", bool_or(name = 'page_view') AS visit,
          bool_or(name = 'add_to_cart') AS cart, bool_or(name = 'begin_checkout') AS checkout,
          bool_or(name = 'quote_created') AS quote, max("createdAt") AS last
        FROM "StoreAnalyticsEvent" WHERE "createdAt" >= ${start} AND "createdAt" <= ${end} GROUP BY "sessionId"
      ) SELECT count(*) FILTER (WHERE visit) AS visits, count(*) FILTER (WHERE cart) AS carts,
        count(*) FILTER (WHERE checkout) AS starts, count(*) FILTER (WHERE quote) AS quotes,
        count(*) FILTER (WHERE cart AND NOT quote AND last <= ${inactive}) AS abandoned FROM sessions`,
    prisma.storeAnalyticsEvent.groupBy({ by: ["name"], where, _count: true }),
    prisma.$queryRaw<Array<{ code: string; name: string; views: bigint; carts: bigint }>>`
      SELECT e."productCode" AS code, coalesce(p.name, e."productCode") AS name,
        count(*) FILTER (WHERE e.name = 'view_item') AS views,
        count(*) FILTER (WHERE e.name = 'add_to_cart') AS carts
      FROM "StoreAnalyticsEvent" e LEFT JOIN "Product" p ON p.code = e."productCode"
      WHERE e."createdAt" >= ${start} AND e."createdAt" <= ${end} AND e.name IN ('view_item', 'add_to_cart')
      GROUP BY e."productCode", p.name ORDER BY count(*) DESC LIMIT 10`,
    prisma.$queryRaw<Array<{ term: string; total: bigint; empty: bigint }>>`
      SELECT "searchTerm" AS term, count(*) AS total, count(*) FILTER (WHERE "resultCount" = 0) AS empty
      FROM "StoreAnalyticsEvent" WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
      AND name = 'search_results' AND "searchTerm" IS NOT NULL AND "searchTerm" <> ''
      GROUP BY "searchTerm" ORDER BY count(*) FILTER (WHERE "resultCount" = 0) DESC, count(*) DESC LIMIT 10`,
    prisma.$queryRaw<Array<{ label: string; total: bigint }>>`SELECT source AS label, count(DISTINCT "sessionId") AS total FROM "StoreAnalyticsEvent" WHERE "createdAt" >= ${start} AND "createdAt" <= ${end} GROUP BY source ORDER BY total DESC`,
    prisma.$queryRaw<Array<{ label: string; total: bigint }>>`SELECT device AS label, count(DISTINCT "sessionId") AS total FROM "StoreAnalyticsEvent" WHERE "createdAt" >= ${start} AND "createdAt" <= ${end} GROUP BY device ORDER BY total DESC`,
    prisma.order.count({ where: { ...where, isTest: false, status: "PAID", OR: [{ culqiChargeId: null }, { NOT: { culqiChargeId: { startsWith: "sim_" } } }] } }),
  ]);
  return { start, end, session: sessions[0], events: Object.fromEntries(events.map(row => [row.name, row._count])), products, searches, sources, devices, orders };
}
