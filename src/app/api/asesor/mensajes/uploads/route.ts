import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getMessageCenterSession } from "@/lib/auth";
import { prepareMessagingUpload } from "@/lib/messaging-upload";

export const runtime = "nodejs";

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/3gpp",
  "video/webm",
  "video/quicktime",
  "audio/aac",
  "audio/amr",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "application/pdf",
]);
const attempts = new Map<string, { count: number; resetAt: number }>();

function sanitizeBaseName(value: string) {
  return value.trim().replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

function allowUpload(userId: string) {
  const now = Date.now();
  const current = attempts.get(userId);
  if (!current || current.resetAt <= now) {
    attempts.set(userId, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return true;
  }
  if (current.count >= 20) return false;
  current.count += 1;
  return true;
}

export async function POST(request: Request) {
  const session = await getMessageCenterSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  if (!allowUpload(session.userId)) return NextResponse.json({ error: "Demasiados intentos de carga. Intenta nuevamente en unos minutos." }, { status: 429 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) return NextResponse.json({ error: "Selecciona un archivo válido." }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "El archivo supera el tamaño permitido de 25 MB." }, { status: 413 });

  const mimeType = file.type.split(";")[0].trim().toLowerCase();
  if (!allowedMimeTypes.has(mimeType)) return NextResponse.json({ error: "Formato no permitido. Usa una imagen, video, audio o PDF válido." }, { status: 400 });

  try {
    const prepared = await prepareMessagingUpload(Buffer.from(await file.arrayBuffer()), mimeType);
    const fileBase = `${Date.now()}-${randomUUID().slice(0, 8)}-${sanitizeBaseName(file.name) || "archivo"}`;
    const folder = path.join(/* turbopackIgnore: true */ process.cwd(), "public", "uploads", "documents");
    const fileName = `${fileBase}${prepared.extension}`;
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, fileName), prepared.buffer);
    return NextResponse.json({ fileName, folder: "documents", url: `/uploads/documents/${fileName}` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo preparar el archivo para enviar." }, { status: 422 });
  }
}
