import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { disconnectLocalWhatsappIntegration } from "@/lib/whatsapp-integrations";

export const dynamic = "force-dynamic";

const disconnectSchema = z.object({
  integrationId: z.string().trim().min(1).max(120),
});

export async function POST(request: Request) {
  await requireAdmin();

  try {
    const { integrationId } = disconnectSchema.parse(await request.json());
    await disconnectLocalWhatsappIntegration(
      (args) => prisma.whatsappIntegration.delete(args),
      integrationId,
    );
    return NextResponse.json({ ok: true, disconnected: true, scope: "local-persistence-only" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "integrationId es requerido." }, { status: 400 });
    }

    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ ok: false, error: "La integración local no existe." }, { status: 404 });
    }

    return NextResponse.json({ ok: false, error: "No se pudo desconectar la integración local." }, { status: 500 });
  }
}
