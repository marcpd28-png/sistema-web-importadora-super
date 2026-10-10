import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { parseSocialChannel, socialRequest, socialConversation, socialConnectionStatus, safeSocialMessage, sendSocialReply, SocialInboxError, type SocialPage, type SocialConversation, type SocialMessage } from "@/lib/social-inbox";
import { z } from "zod";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ channel: string }> };
function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof SocialInboxError ? error.message : "No se pudo cargar la mensajería." },
    { status: error instanceof SocialInboxError ? error.status : 500 });
}
export async function GET(request: NextRequest, context: Context) {
  await requireAdmin();
  try {
    const channel = parseSocialChannel((await context.params).channel);
    if (request.nextUrl.searchParams.get("status") === "1") {
      return NextResponse.json(await socialConnectionStatus(channel), { headers: { "Cache-Control": "no-store" } });
    }
    const id = request.nextUrl.searchParams.get("conversationId");
    const cursor = request.nextUrl.searchParams.get("cursor");
    const query = new URLSearchParams({ perPage: "50" });
    if (cursor) { if (cursor.length > 2000) throw new SocialInboxError("Cursor no válido.", 400); query.set("cursor", cursor); }
    if (id) {
      const { conversation, inbox } = await socialConversation(id, channel);
      const page = await socialRequest<SocialPage<SocialMessage>>(`/conversations/${id}/messages?${query}`);
      return NextResponse.json({ ...page, data: page.data.filter(m => m.contactInboxId === inbox.id).map(safeSocialMessage), botEnabled: conversation.botEnabled }, { headers: { "Cache-Control": "no-store" } });
    }
    query.set("channel", channel);
    query.set("botCategory", "all");
    const keyword = request.nextUrl.searchParams.get("keyword");
    if (keyword) query.set("keyword", keyword.slice(0, 100));
    const page = await socialRequest<SocialPage<SocialConversation>>(`/conversations?${query}`);
    // Only expose display fields, never provider auth or contact attributes.
    return NextResponse.json({ data: page.data.filter(c => c.contactInboxes.some(i => i.channel === channel)).map(c => ({
      id: c.id, name: c.contact?.fullName || "Cliente", botEnabled: c.botEnabled,
      preview: c.messages?.find(m => c.contactInboxes.some(i => i.channel === channel && i.id === m.contactInboxId))?.text || "Conversación",
    })), nextCursor: page.nextCursor }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
const sendSchema = z.object({ conversationId: z.string().regex(/^\d+$/), text: z.string().trim().max(1000).default(""), requestId: z.string().uuid(), mediaFileId: z.string().regex(/^\d+$/).optional() }).refine(value => value.text || value.mediaFileId);
export async function POST(request: NextRequest, context: Context) {
  await requireAdmin();
  let sameOrigin = false;
  try {
    const origin = new URL(request.headers.get("origin") || "");
    sameOrigin = ["https:", "http:"].includes(origin.protocol) && origin.host === request.headers.get("host")?.toLowerCase();
  } catch { /* Missing or malformed browser origin fails closed. */ }
  if (!sameOrigin) return NextResponse.json({ error: "Origen no autorizado." }, { status: 403 });
  try {
    const channel = parseSocialChannel((await context.params).channel);
    const parsed = sendSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Escribe hasta 1000 caracteres o adjunta un archivo." }, { status: 400 });
    const { conversationId, text, requestId, mediaFileId } = parsed.data;
    const message = await sendSocialReply(channel, conversationId, text, requestId, mediaFileId);
    return NextResponse.json({ message });
  } catch (error) { return failure(error); }
}
