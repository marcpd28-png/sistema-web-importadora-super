import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { MessageTemplateError } from "@/lib/message-templates-service";

export function templateErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "El cuerpo JSON no es válido." }, { status: 400 });
  if (error instanceof MessageTemplateError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return NextResponse.json({ error: "Ya existe una plantilla con ese nombre." }, { status: 409 });
    if (error.code === "P2025") return NextResponse.json({ error: "La plantilla ya no existe." }, { status: 404 });
  }
  console.error("[message-templates] request failed");
  return NextResponse.json({ error: "No se pudo completar la operación. Intenta nuevamente." }, { status: 500 });
}
