import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Entrada retirada. Usa el simulador autenticado del centro de mensajes." }, { status: 410 });
}
