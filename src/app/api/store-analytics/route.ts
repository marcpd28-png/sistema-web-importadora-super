import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { cleanSearchTerm, storeEventBatchSchema } from "@/lib/store-analytics-contract";

export const runtime = "nodejs";
const buckets = new Map<string, { until: number; count: number }>();
let lastPrune = 0;
function allowed(key: string, max: number) {
  const now = Date.now();
  if (buckets.size > 5000) for (const [id, item] of buckets) if (item.until < now) buckets.delete(id);
  const item = buckets.get(key);
  if (!item || item.until < now) { if (buckets.size > 5000) return false; buckets.set(key, { until: now + 60000, count: 1 }); return true; }
  return ++item.count <= max;
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  try { if (!origin || new URL(origin).host !== host) return new Response(null, { status: 403 }); } catch { return new Response(null, { status: 403 }); }
  const bucket = createHash("sha256").update(request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").digest("hex");
  if (!allowed("global", 1500) || !allowed(bucket, 120)) return new Response(null, { status: 429 });
  if (Number(request.headers.get("content-length") || 0) > 10000) return new Response(null, { status: 413 });
  try {
    const text = await request.text();
    if (text.length > 10000) return new Response(null, { status: 413 });
    let body: unknown;
    try { body = JSON.parse(text); } catch { return new Response(null, { status: 400 }); }
    const parsed = storeEventBatchSchema.safeParse(body);
    if (!parsed.success) return new Response(null, { status: 400 });
    const { events, sessionId, source, device } = parsed.data;
    const rows = [];
    for (const event of events) {
      if (event.quoteId) {
        const quote = await prisma.quote.findFirst({ where: { id: event.quoteId, status: "ERP_REGISTERED", createdAt: { gte: new Date(Date.now() - 3600000) } }, select: { id: true } });
        if (!quote) continue;
      }
      rows.push({ ...event, sessionId, source, device, searchTerm: event.searchTerm ? cleanSearchTerm(event.searchTerm) || null : null });
    }
    if (rows.length) await prisma.storeAnalyticsEvent.createMany({ data: rows, skipDuplicates: true });
    if (Date.now() - lastPrune > 6 * 3600000) {
      lastPrune = Date.now();
      await prisma.storeAnalyticsEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86400000) } } });
    }
    return new Response(null, { status: 204 });
  } catch { return new Response(null, { status: 503 }); }
}
