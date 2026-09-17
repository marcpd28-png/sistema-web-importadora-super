import { NextResponse } from "next/server";

// Managed flows finish their execution inside the signed execute endpoint.
// The former unauthenticated status callback must not be able to alter the log.
export async function POST() {
  return NextResponse.json({ error: "Este callback fue reemplazado por la ejecución firmada del flujo." }, { status: 410 });
}
