import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { extractDeliveryEvents, persistDeliveryEvents } from "@/lib/message-delivery";

// n8n may forward an authenticated, unmodified Meta statuses payload here.
export async function POST(request: Request) {
  const expected = Buffer.from(process.env.N8N_INTERNAL_API_KEY ?? "");
  const supplied = Buffer.from(request.headers.get("x-internal-api-key") ?? "");
  if (!expected.length || supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (process.env.WHATSAPP_STATUS_SYNC_ENABLED !== "true") return Response.json({ error: "Not activated" }, { status: 503 });
  const allowed = new Set((process.env.WHATSAPP_STATUS_PHONE_NUMBER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean));
  const events = extractDeliveryEvents(await request.json().catch(() => null), allowed);
  if (!events.length) return Response.json({ error: "No supported receipts for a configured number" }, { status: 422 });
  const recorded = await persistDeliveryEvents(prisma, events);
  return Response.json({ ok: true, recorded });
}
