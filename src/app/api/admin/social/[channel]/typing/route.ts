import { NextRequest, NextResponse } from "next/server";
import { getMessagingOwnerSession } from "@/lib/auth";
import { parseSocialChannel, socialConversation, SocialInboxError } from "@/lib/social-inbox";
import { setTikTokBridgeTyping, TikTokBridgeError } from "@/lib/tiktok-bridge";
import { z } from "zod";

export const dynamic = "force-dynamic";

const typingSchema = z.object({ typing: z.boolean() }).strict();

function sameOrigin(request: NextRequest) {
  try {
    const origin = new URL(request.headers.get("origin") || "");
    return ["https:", "http:"].includes(origin.protocol) && origin.host === request.headers.get("host")?.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * This endpoint is deliberately separate from a manual handoff.  It merely
 * renews a short local lease in the TikTok bridge, which expires by itself if
 * the adviser closes the tab or loses network connectivity.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ channel: string }> }) {
  if (!(await getMessagingOwnerSession())) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origen no autorizado." }, { status: 403 });

  try {
    const channel = parseSocialChannel((await context.params).channel);
    if (channel !== "tiktok") return NextResponse.json({ error: "Este canal no usa indicador de escritura." }, { status: 409 });
    const parsed = typingSchema.parse(await request.json());
    const conversationId = request.nextUrl.searchParams.get("conversationId") || "";
    const { conversation } = await socialConversation(conversationId, channel);

    // Never start a new transient hold once the conversation was explicitly
    // handed to a human. Clearing an old one remains safe.
    if (parsed.typing && !conversation.botEnabled) {
      return NextResponse.json({ typing: false, ignored: true }, { headers: { "Cache-Control": "no-store" } });
    }
    const result = await setTikTokBridgeTyping(conversationId, parsed.typing);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof SocialInboxError ? error.status : error instanceof TikTokBridgeError ? error.statusCode : error instanceof z.ZodError ? 400 : 500;
    const message = error instanceof z.ZodError ? "Indicador de escritura inválido."
      : error instanceof Error ? error.message : "No se pudo actualizar el indicador de escritura.";
    return NextResponse.json({ error: message }, { status });
  }
}
