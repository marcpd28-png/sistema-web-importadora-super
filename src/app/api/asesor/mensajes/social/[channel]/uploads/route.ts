import { NextRequest, NextResponse } from "next/server";
import { getMessageCenterSession } from "@/lib/auth";
import { socialReplyInbox, SocialInboxError } from "@/lib/social-inbox";
import { SOCIAL_FILE_LIMIT, uploadSocialFile } from "@/lib/social-media";
import { parseAdvisorSocialChannel } from "@/lib/advisor-social-channel";

export const runtime = "nodejs";

async function hasAdvisorMessageSession() {
  const session = await getMessageCenterSession();
  return session?.role === "ASESOR";
}

function hasSameOrigin(request: NextRequest) {
  try {
    const origin = new URL(request.headers.get("origin") || "");
    return ["https:", "http:"].includes(origin.protocol) && origin.host === request.headers.get("host")?.toLowerCase();
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ channel: string }> }) {
  if (!(await hasAdvisorMessageSession())) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Origen no autorizado." }, { status: 403 });

  try {
    if (parseAdvisorSocialChannel((await context.params).channel) !== "messenger") {
      throw new SocialInboxError("Los adjuntos todavía no están habilitados en este canal.", 400);
    }
    if (Number(request.headers.get("content-length")) > SOCIAL_FILE_LIMIT + 65536) {
      throw new SocialInboxError("El archivo supera 5 MB.", 413);
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new SocialInboxError("Selecciona un archivo.", 400);
    await socialReplyInbox("messenger", String(form.get("conversationId") || ""));
    return NextResponse.json(await uploadSocialFile(file));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof SocialInboxError ? error.message : "No se pudo preparar el archivo." },
      { status: error instanceof SocialInboxError ? error.status : 500 },
    );
  }
}
