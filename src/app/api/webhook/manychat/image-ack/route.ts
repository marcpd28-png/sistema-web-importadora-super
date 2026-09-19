import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { manychatImageAckSchema, verifyManychatImageAckToken } from "@/lib/manychat-image-ack";

export const runtime = "nodejs";

// Records that a flow reached its final action, never delivery or a new message.
export async function POST(request: Request) {
  const secret = process.env.N8N_INTERNAL_API_KEY?.trim();
  if (!secret) return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });
  const input = manychatImageAckSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ ok: false, error: "Invalid acknowledgement" }, { status: 400 });
  const { requestId, subscriberId, token } = input.data;
  if (!verifyManychatImageAckToken(requestId, subscriberId, token, secret)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const messages = await prisma.chatMessage.findMany({
      where: {
        direction: "OUTBOUND", messageType: "IMAGE", senderType: { in: ["AGENT", "BOT"] },
        metadata: { path: ["requestId"], equals: requestId },
        conversation: { channel: "WHATSAPP", contact: { manychatSubscriberId: subscriberId } },
      },
      select: { id: true }, take: 2,
    });
    if (messages.length !== 1) return NextResponse.json({ ok: false, error: "Dispatch not found or ambiguous" }, { status: 409 });
    const ack = JSON.stringify({ manychatImageFlowAck: { requestId, subscriberId, processedAt: new Date().toISOString() } });
    // Atomic JSON merge preserves concurrent status/provider updates and first receipt time.
    const changed = await prisma.$executeRaw`
      UPDATE "ChatMessage"
      SET "metadata" = COALESCE("metadata", '{}'::jsonb) || ${ack}::jsonb
      WHERE "id" = ${messages[0].id}
      AND NOT (COALESCE("metadata", '{}'::jsonb) ? 'manychatImageFlowAck')
    `;
    return NextResponse.json({ ok: true, duplicate: changed === 0, flowProcessed: true, deliveryConfirmed: false });
  } catch {
    console.error("[manychat-image-ack] receipt persistence failed");
    return NextResponse.json({ ok: false, error: "Receipt persistence failed" }, { status: 500 });
  }
}
