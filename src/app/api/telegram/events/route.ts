import { telegramAuthorized } from "@/lib/telegram-bridge";
import { receiveTelegramEvent } from "@/lib/telegram-events";
import { z } from "zod";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!telegramAuthorized(request.headers.get("authorization"))) return Response.json({ error: "No autorizado" }, { status: 401 });
  const text = await request.text();
  if (Buffer.byteLength(text) > 128000) return Response.json({ error: "Evento demasiado grande" }, { status: 413 });
  try { return Response.json(await receiveTelegramEvent(JSON.parse(text))); }
  catch (error) {
    const invalid = error instanceof z.ZodError || error instanceof SyntaxError;
    console.error("telegram_event_failed", invalid ? "invalid_event" : "storage_error");
    return Response.json({ error: invalid ? "Evento inválido" : "No se pudo guardar el mensaje" }, { status: invalid ? 400 : 503 });
  }
}
