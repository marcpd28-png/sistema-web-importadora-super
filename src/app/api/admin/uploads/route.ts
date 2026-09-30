import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createNormalizedProductImage } from "@/lib/product-image-normalization";
import { prepareWhatsAppUpload } from "@/lib/whatsapp-upload";

export const runtime = "nodejs";

const allowedFolders = new Set(["products", "hero", "categories", "documents"]);
const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
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
const uploadRateWindowMs = 10 * 60 * 1000;
const uploadRateLimit = 20;
const uploadAttempts = new Map<string, { count: number; resetAt: number }>();

function sanitizeBaseName(value: string) {
  return value
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function getExtension(file: File) {
  const nameExtension = path.extname(file.name).toLowerCase();

  if (nameExtension && nameExtension.length <= 6) {
    return nameExtension;
  }

  if (file.type.startsWith("image/")) {
    if (file.type === "image/jpeg") return ".jpg";
    if (file.type === "image/png") return ".png";
    if (file.type === "image/webp") return ".webp";
    if (file.type === "image/gif") return ".gif";
    if (file.type === "image/svg+xml") return ".svg";
    return ".img";
  }

  if (file.type.startsWith("video/")) {
    if (file.type === "video/mp4") return ".mp4";
    if (file.type === "video/webm") return ".webm";
    if (file.type === "video/quicktime") return ".mov";
    return ".video";
  }

  if (file.type.startsWith("audio/")) {
    if (file.type === "audio/mpeg") return ".mp3";
    if (file.type === "audio/mp4" || file.type === "audio/x-m4a") return ".m4a";
    if (file.type === "audio/ogg") return ".ogg";
    if (file.type === "audio/wav") return ".wav";
    if (file.type === "audio/aac") return ".aac";
    if (file.type === "audio/webm") return ".webm";
    return ".audio";
  }

  if (file.type === "application/pdf") return ".pdf";
  return ".bin";
}

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

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

async function writeOptimizedImageVariants(
  inputBuffer: Buffer,
  outputDir: string,
  fileBase: string,
) {
  const image = await createNormalizedProductImage(inputBuffer);
  const metadata = await image.metadata();
  const optimizedPath = path.join(outputDir, `${fileBase}.webp`);
  const mobilePath = path.join(outputDir, `${fileBase}-mobile.webp`);
  const thumbPath = path.join(outputDir, `${fileBase}-thumb.webp`);

  await Promise.all([
    image.clone().resize({ width: 1920, withoutEnlargement: true }).webp({ quality: 84 }).toFile(optimizedPath),
    image.clone().resize({ width: 1080, withoutEnlargement: true }).webp({ quality: 82 }).toFile(mobilePath),
    image.clone().resize({ width: 640, withoutEnlargement: true }).webp({ quality: 78 }).toFile(thumbPath),
  ]);

  return {
    desktopUrl: `/uploads/${path.basename(outputDir)}/${path.basename(optimizedPath)}`,
    mobileUrl: `/uploads/${path.basename(outputDir)}/${path.basename(mobilePath)}`,
    thumbUrl: `/uploads/${path.basename(outputDir)}/${path.basename(thumbPath)}`,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
  };
}

export async function POST(request: Request) {
  await requireAdmin();

  if (!allowUpload(request)) {
    return NextResponse.json(
      { error: "Demasiados intentos de carga. Intenta nuevamente en unos minutos." },
      { status: 429 },
    );
  }

  const formData = await request.formData();
  const fileEntry = formData.get("file");
  const folderValue = String(formData.get("folder") ?? "products").trim();
  const folder = allowedFolders.has(folderValue) ? folderValue : "products";

  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: "Selecciona un archivo válido." }, { status: 400 });
  }

  if (fileEntry.size <= 0) {
    return NextResponse.json({ error: "El archivo está vacío." }, { status: 400 });
  }

  if (!allowedMimeTypes.has(fileEntry.type)) {
    return NextResponse.json(
      { error: "Formato no permitido. Usa una imagen, video, audio o PDF válido." },
      { status: 400 },
    );
  }

  const maxSize = 25 * 1024 * 1024;

  if (fileEntry.size > maxSize) {
    return NextResponse.json(
      { error: "El archivo supera el tamaño permitido de 25 MB." },
      { status: 413 },
    );
  }

  const uploadedAt = Date.now();
  const baseName = sanitizeBaseName(fileEntry.name) || "archivo";
  const fileBase = `${uploadedAt}-${randomUUID().slice(0, 8)}-${baseName}`;
  const uploadDir = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "public",
    "uploads",
    folder,
  );
  const buffer = Buffer.from(await fileEntry.arrayBuffer());

  await mkdir(uploadDir, { recursive: true });

  if (folder === "documents") {
    try {
      const prepared = await prepareWhatsAppUpload(buffer, fileEntry.type);
      const fileName = `${fileBase}${prepared.extension}`;
      await writeFile(path.join(uploadDir, fileName), prepared.buffer);
      return NextResponse.json({ fileName, folder, url: `/uploads/${folder}/${fileName}` });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo preparar el archivo para WhatsApp." }, { status: 422 });
    }
  }

  if (isImageFile(fileEntry)) {
    const optimized = await writeOptimizedImageVariants(buffer, uploadDir, fileBase);

    return NextResponse.json({
      fileName: `${fileBase}.webp`,
      folder,
      url: optimized.desktopUrl,
      desktopUrl: optimized.desktopUrl,
      mobileUrl: optimized.mobileUrl,
      thumbUrl: optimized.thumbUrl,
      width: optimized.width,
      height: optimized.height,
    });
  }

  const fileName = `${fileBase}${getExtension(fileEntry)}`;
  await writeFile(
    path.join(/* turbopackIgnore: true */ uploadDir, fileName),
    buffer,
  );

  return NextResponse.json({
    fileName,
    folder,
    url: `/uploads/${folder}/${fileName}`,
  });
}
