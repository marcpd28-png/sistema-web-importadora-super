import { NextRequest, NextResponse } from "next/server";
import { getMessageCenterSession } from "@/lib/auth";
import {
  dedupeSocialMessages,
  parseSocialChannel,
  refreshSocialConversationProfiles,
  safeSocialMessage,
  sendSocialReply,
  socialConnectionStatus,
  socialConversation,
  socialConversationDisplayName,
  socialRequest,
  SocialInboxError,
  type SocialConversation,
  type SocialMessage,
  type SocialPage,
} from "@/lib/social-inbox";
import { z } from "zod";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ channel: string }> };

function failure(error: unknown) {
  return NextResponse.json(
    { error: error instanceof SocialInboxError ? error.message : "No se pudo cargar la mensajería." },
    { status: error instanceof SocialInboxError ? error.status : 500 },
  );
}

function sameOrigin(request: NextRequest) {
  try {
    const origin = new URL(request.headers.get("origin") || "");
    return ["https:", "http:"].includes(origin.protocol) && origin.host === request.headers.get("host")?.toLowerCase();
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest, context: Context) {
  if (!await getMessageCenterSession()) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  try {
    const channel = parseSocialChannel((await context.params).channel);
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
      const channelMessages = page.data.filter((message) => message.contactInboxId === inbox.id);
      return NextResponse.json({
        ...page,
        data: dedupeSocialMessages(channelMessages).map((message) => safeSocialMessage(message, { channel, conversationId: id })),
        botEnabled: conversation.botEnabled,
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const view = request.nextUrl.searchParams.get("view") || "inbox";
    if (view !== "inbox" && view !== "pending") throw new SocialInboxError("Vista de conversaciones no válida.", 400);
    query.set("channel", channel);
    query.set("botCategory", "all");
    const keyword = request.nextUrl.searchParams.get("keyword");
    if (keyword) query.set("keyword", keyword.slice(0, 100));
    const page = await socialRequest<SocialPage<SocialConversation>>(`/conversations?${query}`);
    const conversations = await refreshSocialConversationProfiles(page.data, channel);
    return NextResponse.json({
      data: conversations
        .filter((conversation) => conversation.contactInboxes.some((inbox) => inbox.channel === channel))
        .filter((conversation) => view === "pending" ? !conversation.botEnabled : conversation.botEnabled)
        .map((conversation) => ({
          id: conversation.id,
          name: socialConversationDisplayName(conversation, channel),
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
  if (!await getMessageCenterSession()) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origen no autorizado." }, { status: 403 });

  try {
    const channel = parseSocialChannel((await context.params).channel);
    const parsed = sendSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Escribe hasta 1000 caracteres o adjunta un archivo." }, { status: 400 });
    const message = await sendSocialReply(channel, parsed.data.conversationId, parsed.data.text, parsed.data.requestId, parsed.data.mediaFileId);
    return NextResponse.json({ message });
  } catch (error) {
    return failure(error);
  }
}
