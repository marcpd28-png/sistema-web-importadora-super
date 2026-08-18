import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/jpg",
  "application/pdf",
]);

const maxFileSize = 10 * 1024 * 1024; // 10MB

const uploadRateWindowMs = 10 * 60 * 1000;
const uploadRateLimit = 15;
const uploadAttempts = new Map<string, { count: number; resetAt: number }>();

function getRequestFingerprint(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

function allowUpload(request: Request) {
  const fingerprint = getRequestFingerprint(request);
  const now = Date.now();
  const current = uploadAttempts.get(fingerprint);

  if (!current || current.resetAt <= now) {
    uploadAttempts.set(fingerprint, { count: 1, resetAt: now + uploadRateWindowMs });
    return true;
  }

  if (current.count >= uploadRateLimit) {
    return false;
  }

  current.count += 1;
  return true;
}

function getSafeExtension(filename: string, mimeType: string) {
  const ext = path.extname(filename).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".pdf"].includes(ext)) {
    return ext;
  }

  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return ".jpg";

  return ".bin";
}

export async function POST(request: Request) {
  try {
    if (!allowUpload(request)) {
      return NextResponse.json(
        { ok: false, message: "Límite de subida excedido. Intenta de nuevo más tarde." },
        { status: 429 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, message: "No se proporcionó ningún archivo válido." },
        { status: 400 },
      );
    }

    if (!allowedMimeTypes.has(file.type)) {
      return NextResponse.json(
        { ok: false, message: "Tipo de archivo no permitido. Solo se permiten PDF, PNG, JPG, JPEG." },
        { status: 400 },
      );
    }

    if (file.size > maxFileSize) {
      return NextResponse.json(
        { ok: false, message: "El tamaño del archivo no debe superar los 10MB." },
        { status: 400 },
      );
    }

    const outputDir = path.join(process.cwd(), "public", "uploads", "complaints");
    await mkdir(outputDir, { recursive: true });

    const safeExt = getSafeExtension(file.name, file.type);
    const fileName = `${randomUUID()}${safeExt}`;
    const filePath = path.join(outputDir, fileName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    const url = `/uploads/complaints/${fileName}`;

    return NextResponse.json({
      ok: true,
      url,
      name: file.name,
      size: file.size,
    });
  } catch (error) {
    console.error("Error al subir archivo de sustento:", error);
    return NextResponse.json(
      { ok: false, message: "Ocurrió un error al subir el archivo." },
      { status: 500 },
    );
  }
}
