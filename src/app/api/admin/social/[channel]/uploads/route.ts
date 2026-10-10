import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { parseSocialChannel, socialReplyInbox, SocialInboxError } from "@/lib/social-inbox";
import { SOCIAL_FILE_LIMIT, uploadSocialFile } from "@/lib/social-media";

export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ channel: string }> }) {
  await requireAdmin();
  try {
    const origin = new URL(request.headers.get("origin") || "");
    if (!["https:", "http:"].includes(origin.protocol) || origin.host !== request.headers.get("host")?.toLowerCase()) throw new Error();
  } catch { return NextResponse.json({ error: "Origen no autorizado." }, { status: 403 }); }
  try {
    if (parseSocialChannel((await context.params).channel) !== "messenger") throw new SocialInboxError("Los adjuntos todavía no están habilitados en este canal.", 400);
    if (Number(request.headers.get("content-length")) > SOCIAL_FILE_LIMIT + 65536) throw new SocialInboxError("El archivo supera 5 MB.", 413);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new SocialInboxError("Selecciona un archivo.", 400);
    await socialReplyInbox("messenger", String(form.get("conversationId") || ""));
    return NextResponse.json(await uploadSocialFile(file));
  } catch (error) {
    return NextResponse.json({ error: error instanceof SocialInboxError ? error.message : "No se pudo preparar el archivo." }, { status: error instanceof SocialInboxError ? error.status : 500 });
  }
}
