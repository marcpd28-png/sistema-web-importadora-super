import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMessageMedia } from "@/lib/message-media";
import { fetchWhatsappMessageMedia } from "@/lib/whatsapp-message-media";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (session.role !== "ADMIN") return Response.json({ error: "Acceso denegado" }, { status: 403 });

  const { id } = await params;
  const message = await prisma.chatMessage.findUnique({
    where: { id },
    select: { messageType: true, mediaUrl: true, metadata: true, conversation: { select: { channel: true } } },
  });
  if (!message || message.conversation.channel !== "WHATSAPP") {
    return Response.json({ error: "Archivo no encontrado" }, { status: 404 });
  }
  const media = getMessageMedia(message);
  if (!media.mediaId || !["AUDIO", "STICKER", "IMAGE", "VIDEO", "DOCUMENT"].includes(media.type)) {
    return Response.json({ error: "Archivo no disponible" }, { status: 404 });
  }
  try {
    return await fetchWhatsappMessageMedia(media, request.headers.get("range"));
  } catch {
    return Response.json({ error: "No se pudo cargar el archivo de WhatsApp. Inténtalo nuevamente." }, { status: 502 });
  }
}
