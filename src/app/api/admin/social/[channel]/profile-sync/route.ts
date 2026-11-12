import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMessagingOwnerSession } from "@/lib/auth";
import { parseSocialChannel, SocialInboxError, syncSocialProfilePage } from "@/lib/social-inbox";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ channel: string }> };

const syncSchema = z.object({ cursor: z.string().min(1).max(2000).optional() }).strict();

function sameOrigin(request: NextRequest) {
  try {
    const origin = new URL(request.headers.get("origin") || "");
    return ["https:", "http:"].includes(origin.protocol) && origin.host === request.headers.get("host")?.toLowerCase();
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest, context: Context) {
  if (!await getMessagingOwnerSession()) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origen no autorizado." }, { status: 403 });

  const parsed = syncSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Lote de sincronización no válido." }, { status: 400 });

  try {
    const channel = parseSocialChannel((await context.params).channel);
    return NextResponse.json(await syncSocialProfilePage(channel, parsed.data.cursor), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof SocialInboxError ? error.message : "No se pudieron sincronizar los perfiles.";
    const status = error instanceof SocialInboxError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
