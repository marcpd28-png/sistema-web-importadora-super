import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMessageCenterSession } from "@/lib/auth";
import {
  dedupeSocialMessages,
  safeSocialMessage,
  sendSocialReply,
  socialConnectionStatus,
  socialConversation,
  SocialInboxError,
  socialRequest,
  type SocialConversation,
  type SocialMessage,
  type SocialPage,
} from "@/lib/social-inbox";
import { pauseForHuman } from "@/lib/rocky-ai/service";
import { parseAdvisorSocialChannel } from "@/lib/advisor-social-channel";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ channel: string }> };

async function getAdvisorMessageSession() {
  const session = await getMessageCenterSession();
  return session?.role === "ASESOR" ? session : null;
}

function failure(error: unknown) {
  return NextResponse.json(
    { error: error instanceof SocialInboxError ? error.message : "No se pudo cargar la mensajería." },
    { status: error instanceof SocialInboxError ? error.status : 500 },
  );
}

function hasSameOrigin(request: NextRequest) {
  try {
    const origin = new URL(request.headers.get("origin") || "");
    return ["https:", "http:"].includes(origin.protocol) && origin.host === request.headers.get("host")?.toLowerCase();
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest, context: Context) {
  if (!(await getAdvisorMessageSession())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  try {
    const channel = parseAdvisorSocialChannel((await context.params).channel);
    if (request.nextUrl.searchParams.get("status") === "1") {
      return NextResponse.json(await socialConnectionStatus(channel), { headers: { "Cache-Control": "no-store" } });
    }

    const id = request.nextUrl.searchParams.get("conversationId");
    const cursor = request.nextUrl.searchParams.get("cursor");
    const query = new URLSearchParams({ perPage: "50" });
    if (cursor) {
      if (cursor.length > 2000) throw new SocialInboxError("Cursor no válido.", 400);
      query.set("cursor", cursor);
    }

    if (id) {
      const { conversation, inbox } = await socialConversation(id, channel);
      const page = await socialRequest<SocialPage<SocialMessage>>(`/conversations/${id}/messages?${query}`);
      const messages = page.data.filter((message) => message.contactInboxId === inbox.id);
      return NextResponse.json(
        { ...page, data: dedupeSocialMessages(messages).map(safeSocialMessage), botEnabled: conversation.botEnabled },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    query.set("channel", channel);
    query.set("botCategory", "all");
    const keyword = request.nextUrl.searchParams.get("keyword");
    if (keyword) query.set("keyword", keyword.slice(0, 100));
    const page = await socialRequest<SocialPage<SocialConversation>>(`/conversations?${query}`);
    return NextResponse.json({
      data: page.data.filter((conversation) => conversation.contactInboxes.some((inbox) => inbox.channel === channel)).map((conversation) => ({
        id: conversation.id,
        name: conversation.contact?.fullName || "Cliente",
        botEnabled: conversation.botEnabled,
        preview: conversation.messages?.find((message) => conversation.contactInboxes.some((inbox) => inbox.channel === channel && inbox.id === message.contactInboxId))?.text || "Conversación",
      })),
      nextCursor: page.nextCursor,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

const sendSchema = z.object({
  conversationId: z.string().regex(/^\d+$/),
  text: z.string().trim().max(1000).default(""),
  requestId: z.string().uuid(),
  mediaFileId: z.string().regex(/^\d+$/).optional(),
}).refine((value) => value.text || value.mediaFileId);

export async function POST(request: NextRequest, context: Context) {
  const session = await getAdvisorMessageSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Origen no autorizado." }, { status: 403 });

  try {
    const channel = parseAdvisorSocialChannel((await context.params).channel);
    const parsed = sendSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Escribe hasta 1000 caracteres o adjunta un archivo." }, { status: 400 });

    const { conversationId, text, requestId, mediaFileId } = parsed.data;
    await pauseForHuman(channel, conversationId, session.userId);
    const message = await sendSocialReply(channel, conversationId, text, requestId, mediaFileId);
    return NextResponse.json({ message });
  } catch (error) {
    return failure(error);
  }
}
