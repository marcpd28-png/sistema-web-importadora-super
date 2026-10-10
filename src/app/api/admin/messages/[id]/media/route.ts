import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ycloudMediaKind } from "@/lib/ycloud-media";
import { telegramBridgeHeaders, telegramBridgeUrl } from "@/lib/telegram-bridge";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const message = await prisma.chatMessage.findUnique({
      where: { id },
      select: { mediaUrl: true, messageType: true, metadata: true, conversation: { select: { channel: true } } },
    });
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
    const mediaKind = ycloudMediaKind(message?.mediaUrl ?? null);
    if (!message || message.conversation.channel !== "WHATSAPP" || !mediaKind) {
      return NextResponse.json({ error: "Archivo no disponible" }, { status: 404 });
    }

    const apiKey = process.env.YCLOUD_API_KEY?.trim();
    if (mediaKind === "api" && !apiKey) return NextResponse.json({ error: "YCloud no está configurado" }, { status: 503 });
    const headers = new Headers({ "Accept-Encoding": "identity" });
    // Signed CDN links authenticate through their query; never forward the API key.
    if (mediaKind === "api") headers.set("X-API-Key", apiKey!);
    const range = request.headers.get("range");
    if (range && /^bytes=\d*-\d*$/.test(range)) headers.set("Range", range);
    const response = await fetch(message.mediaUrl!, { headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (response.status !== 200 && response.status !== 206) {
      await response.body?.cancel();
      return NextResponse.json({ error: "YCloud no pudo entregar el archivo" }, { status: 502 });
    }
    const output = new Headers({
      "Content-Type": response.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": message.messageType === "DOCUMENT" ? "attachment" : "inline",
    });
    for (const name of ["content-length", "content-range", "accept-ranges"]) {
      const value = response.headers.get(name);
      if (value) output.set(name, value);
    }
    return new NextResponse(response.body, { status: response.status, headers: output });
  } catch (error) {
    console.error("Error serving YCloud media:", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.json({ error: "No se pudo cargar el archivo" }, { status: 502 });
  }
}
