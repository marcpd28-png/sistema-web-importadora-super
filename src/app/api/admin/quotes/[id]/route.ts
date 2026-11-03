import { NextResponse } from "next/server";
import { QuoteStatus } from "@prisma/client";
import { z } from "zod";
import { canManageQuotes, getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const quoteUpdateSchema = z
  .object({
    status: z.nativeEnum(QuoteStatus).optional(),
    adminNotes: z.string().trim().max(4_000).nullable().optional(),
  })
  .refine((value) => value.status !== undefined || value.adminNotes !== undefined, {
    message: "No se recibió ningún cambio para la cotización.",
  });

const advisorManagedStatuses = new Set<QuoteStatus>([
  "PENDING",
  "IN_REVIEW",
  "RESPONDED",
  "CLOSED",
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || !canManageQuotes(session)) {
      return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    }

    const { id } = await params;
    const body = quoteUpdateSchema.parse(await request.json());

    if (session.role === "ASESOR" && body.status && !advisorManagedStatuses.has(body.status)) {
      return NextResponse.json({ error: "Un asesor no puede cambiar a ese estado de sistema." }, { status: 403 });
    }

    const data = {
      ...(body.status ? { status: body.status } : {}),
      ...(body.adminNotes !== undefined ? { adminNotes: body.adminNotes || null } : {}),
    };

    const updated = await prisma.quote.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, quote: updated });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
}
