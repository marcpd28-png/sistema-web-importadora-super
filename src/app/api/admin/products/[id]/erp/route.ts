import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EditorialWriteError } from "@/lib/facturador/editorial-payload";
import { editorialWriteSelect, markErpEditorialReviewed } from "@/lib/facturador/editorial-write";
import { erpProductSendSchema } from "@/lib/facturador/product-fields";
import { readErpProduct, sendErpProduct } from "@/lib/facturador/product-write";

export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), requestId: z.string().uuid(), revision: z.string().regex(/^[a-f0-9]{64}$/), operation: erpProductSendSchema }).strict(),
  z.object({ action: z.literal("reviewed"), requestId: z.string().uuid() }).strict(),
]);
const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
function failure(error: unknown) {
  if (error instanceof z.ZodError) return reply({ message: error.issues[0]?.message ?? "Datos inválidos." }, 400);
  if (error instanceof SyntaxError) return reply({ message: "Solicitud inválida." }, 400);
  if (error instanceof EditorialWriteError) return reply({ message: error.message }, error.status);
  return reply({ message: "No se pudo completar la solicitud. Comprueba la conexión ERP y actualiza el historial antes de repetir el envío." }, 503);
}
export async function GET(request: Request, context: Context) {
  const session = await getSession();
  if (session?.role !== "ADMIN" || session.requirePasswordChange) return reply({ message: "Acceso no autorizado." }, 403);
  try {
    const { id } = await context.params;
    const writes = await prisma.erpEditorialWrite.findMany({ where: { productId: id }, orderBy: { createdAt: "desc" }, take: 10, select: editorialWriteSelect });
    if (new URL(request.url).searchParams.get("history") === "1") return reply({ writes });
    return reply({ snapshot: await readErpProduct(id), writes });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  const session = await getSession();
  if (session?.role !== "ADMIN" || session.requirePasswordChange) return reply({ message: "Acceso no autorizado." }, 403);
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    if (!["http:", "https:"].includes(origin.protocol) || origin.host !== request.headers.get("host")?.toLowerCase()) return reply({ message: "Origen no permitido." }, 403);
  } catch { return reply({ message: "Origen no permitido." }, 403); }
  try {
    const raw = await request.text();
    if (raw.length > 40000) return reply({ message: "El contenido es demasiado grande." }, 413);
    const input = schema.parse(JSON.parse(raw));
    const { id: productId } = await context.params;
    const write = input.action === "send"
      ? await sendErpProduct({ ...input, productId, actorEmail: session.email })
      : await markErpEditorialReviewed({ ...input, productId, actorEmail: session.email });
    revalidateTag("admin-dashboard", "max");
    revalidateTag("admin-product-stats", "max");
    revalidatePath("/", "layout");
    return reply({ write });
  } catch (error) { return failure(error); }
}
