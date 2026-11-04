import { NextRequest, NextResponse } from "next/server";
import { getMessageCenterSession } from "@/lib/auth";
import { isAdvisorConversationAccessible } from "@/lib/messages-service";
import { prisma } from "@/lib/prisma";
import { telegramBridgeHeaders, telegramBridgeUrl } from "@/lib/telegram-bridge";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getMessageCenterSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  try {
    const { id } = await params;
    const message = await prisma.chatMessage.findUnique({
      where: { id },
      select: {
        mediaUrl: true,
        messageType: true,
        metadata: true,
        conversation: { select: { id: true, channel: true } },
      },
    });
    if (!message || (session.role === "ASESOR" && !(await isAdvisorConversationAccessible(message.conversation.id, session.userId)))) {
      return NextResponse.json({ error: "Archivo no disponible" }, { status: 404 });
    }
    if (message?.conversation.channel === "TELEGRAM") {
      const fileId = (message.metadata as Record<string, unknown> | null)?.telegramFileId;
      if (typeof fileId !== "string") return NextResponse.json({ error: "Archivo no disponible" }, { status: 404 });
      const headers = new Headers(telegramBridgeHeaders());
      const range = request.headers.get("range");
      if (range && /^bytes=\d*-\d*$/.test(range)) headers.set("Range", range);
      // Limit the wait for headers, not the duration of a large catalog download.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      let response: Response;
      try {
        response = await fetch(telegramBridgeUrl(`media?fileId=${encodeURIComponent(fileId)}`), { headers, redirect: "error", cache: "no-store", signal: controller.signal });
      } finally { clearTimeout(timeout); }
      if (!response.ok) return NextResponse.json({ error: "Telegram no pudo entregar el archivo" }, { status: 502 });
      const output = new Headers({ "Content-Type": response.headers.get("content-type") || "application/octet-stream", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": message.messageType === "DOCUMENT" ? "attachment" : "inline" });
      for (const key of ["content-length", "content-range", "accept-ranges"]) { const value = response.headers.get(key); if (value) output.set(key, value); }
      return new NextResponse(response.body, { headers: output, status: response.status });
    }
    return NextResponse.json({ error: "Archivo no disponible" }, { status: 404 });
  } catch (error) {
    console.error("Error serving chat media:", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.json({ error: "No se pudo cargar el archivo" }, { status: 502 });
  }
}
