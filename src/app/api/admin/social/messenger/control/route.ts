import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { messengerControl } from "@/lib/messenger-control";
import { SocialInboxError } from "@/lib/social-inbox";

export const dynamic = "force-dynamic";
function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof SocialInboxError ? error.message : "No se pudo consultar el control de Messenger." },
    { status: error instanceof SocialInboxError ? error.status : 500 });
}
export async function GET(request: NextRequest) {
  await requireAdmin();
  try { return NextResponse.json(await messengerControl(request.nextUrl.searchParams.get("conversationId") || ""), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}
const schema = z.object({ conversationId: z.string().regex(/^\d{1,25}$/), action: z.enum(["manual", "bot", "meta"]), minutes: z.number().int().min(0).max(10080).default(0), resumeTarget: z.enum(["meta", "bot"]).default("meta") });
export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  try {
    const origin = new URL(request.headers.get("origin") || "");
    if (!["https:", "http:"].includes(origin.protocol) || origin.host !== request.headers.get("host")?.toLowerCase()) throw new Error();
  } catch { return NextResponse.json({ error: "Origen no autorizado." }, { status: 403 }); }
  try {
    const data = schema.safeParse(await request.json());
    if (!data.success) return NextResponse.json({ error: "Selecciona una acción y un plazo de hasta 7 días." }, { status: 400 });
    const { conversationId, action, minutes, resumeTarget } = data.data;
    return NextResponse.json(await messengerControl(conversationId, { action, minutes, resumeTarget, actor: session.email }));
  } catch (error) { return failure(error); }
}
