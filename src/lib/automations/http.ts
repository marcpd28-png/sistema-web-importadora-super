import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";

export class AutomationError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export async function authorizeAutomation() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Inicia sesión para administrar los flujos." }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Acceso solo para administradores." }, { status: 403 });
  return null;
}

export function automationErrorResponse(error: unknown) {
  if (error instanceof AutomationError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Revisa los datos del flujo. Hay campos vacíos, demasiado largos o inválidos." }, { status: 400 });
  console.error("[automations] operation failed", error);
  return NextResponse.json({ error: "No se pudo completar la operación. Inténtalo de nuevo." }, { status: 500 });
}
