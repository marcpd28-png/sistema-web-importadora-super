import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { triggerPusherEvent } from "@/lib/pusher-server";
import { manychatOutgoingEventSchema, recordManychatOutgoing } from "@/lib/manychat-outgoing-sync";

export async function POST(request: Request) {
  const expected = Buffer.from(process.env.N8N_INTERNAL_API_KEY ?? "");
  const supplied = Buffer.from(request.headers.get("x-internal-api-key") ?? "");
  if (!expected.length || supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = new Date(process.env.MANYCHAT_OUTGOING_SYNC_STARTED_AT ?? "");
  if (process.env.MANYCHAT_OUTGOING_SYNC_ENABLED !== "true" || !Number.isFinite(startedAt.getTime())) {
    return NextResponse.json({ error: "Sync not activated" }, { status: 503 });
  }
  const input = manychatOutgoingEventSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  try {
    const result = await recordManychatOutgoing(prisma, input.data, startedAt);
    if ("ignored" in result) {
      return NextResponse.json({ ok: false, reason: result.ignored }, {
        status: result.ignored === "before_activation" ? 200 : 422,
      });
    }
    if (!result.duplicate) triggerPusherEvent(`chat-${result.message.conversationId}`, "new-message", result.message);
    return NextResponse.json({ ok: true, duplicate: result.duplicate, messageId: result.message.id });
  } catch {
    console.error("[manychat-outgoing-sync] persistence failed");
    return NextResponse.json({ error: "Persistence failed" }, { status: 500 });
  }
}
