import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EditorialWriteError } from "@/lib/facturador/editorial-payload";
import { editorialWriteSelect, markErpEditorialReviewed, sendErpEditorial } from "@/lib/facturador/editorial-write";

export const maxDuration = 60;
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), requestId: z.string().uuid(), expectedProfileUpdatedAt: z.string().datetime() }).strict(),
  z.object({ action: z.literal("reviewed"), requestId: z.string().uuid() }).strict(),
]);
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const session = await getSession();
  if (session?.role !== "ADMIN" || session.requirePasswordChange) return NextResponse.json({ message: "Acceso no autorizado." }, { status: 403 });
  const { id } = await context.params;
  const writes = await prisma.erpEditorialWrite.findMany({ where: { productId: id }, orderBy: { createdAt: "desc" }, take: 5, select: editorialWriteSelect });
  return NextResponse.json({ writes }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: Context) {
  const session = await getSession();
  if (session?.role !== "ADMIN" || session.requirePasswordChange) return NextResponse.json({ message: "Acceso no autorizado." }, { status: 403 });
  const origin = request.headers.get("origin");
  let sameOrigin = false;
  try {
    // Standalone Next uses its internal hostname in request.url. The incoming
    // Host is preserved by our reverse proxy and cannot be set by browser JS.
    const incomingHost = request.headers.get("host");
    const originUrl = origin ? new URL(origin) : null;
    sameOrigin = Boolean(originUrl && ["https:", "http:"].includes(originUrl.protocol) &&
      incomingHost && originUrl.host === incomingHost.toLowerCase());
  } catch { /* invalid origin */ }
  if (!sameOrigin) {
    return NextResponse.json({ message: "Origen de solicitud no permitido." }, { status: 403 });
  }
  try {
    const input = inputSchema.parse(await request.json());
    const { id: productId } = await context.params;
    const write = input.action === "send"
      ? await sendErpEditorial({ ...input, productId, actorEmail: session.email })
      : await markErpEditorialReviewed({ ...input, productId, actorEmail: session.email });
    return NextResponse.json({ write }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
    if (error instanceof EditorialWriteError) return NextResponse.json({ message: error.message }, { status: error.status });
    // No ERP payloads or tokens in the response or logs.
    console.error("[erp-editorial] request failed", { type: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ message: "No se pudo completar la solicitud. Actualiza el historial antes de intentar otro envío." }, { status: 503 });
  }
}
