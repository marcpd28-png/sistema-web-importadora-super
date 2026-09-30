import sharp from "sharp";

const MIB = 1024 * 1024;
const MEDIA: Record<string, { extension: string; max: number }> = {
  "video/mp4": { extension: ".mp4", max: 16 * MIB },
  "video/3gpp": { extension: ".3gp", max: 16 * MIB },
  "audio/aac": { extension: ".aac", max: 16 * MIB },
  "audio/mpeg": { extension: ".mp3", max: 16 * MIB },
  "audio/mp4": { extension: ".m4a", max: 16 * MIB },
  "audio/x-m4a": { extension: ".m4a", max: 16 * MIB },
  "audio/amr": { extension: ".amr", max: 16 * MIB },
  "audio/ogg": { extension: ".ogg", max: 16 * MIB },
  "application/pdf": { extension: ".pdf", max: 25 * MIB },
};

/** Panel chat uploads are provider media, not storefront WebP thumbnails. */
export async function prepareWhatsAppUpload(buffer: Buffer, mime: string) {
  if (buffer.length > 25 * MIB || !buffer.length) throw new Error("El archivo debe tener contenido y pesar como máximo 25 MB.");
  if (mime.startsWith("image/")) {
    const image = await sharp(buffer, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).toColourspace("srgb").withIccProfile("srgb").jpeg({ quality: 85 }).toBuffer();
    if (image.length > 5 * MIB) throw new Error("La imagen optimizada supera el límite de 5 MB de WhatsApp.");
    return { buffer: image, extension: ".jpg" };
  }
  const format = MEDIA[mime];
  if (!format) throw new Error("WhatsApp requiere video MP4/3GP, audio MP3/M4A/AAC/AMR/OGG Opus o PDF. Convierte este archivo antes de enviarlo.");
  if (buffer.length > format.max) throw new Error("El archivo supera el límite de tamaño de WhatsApp para este formato.");
  if (mime === "audio/ogg" && !buffer.subarray(0, 1024).includes(Buffer.from("OpusHead"))) throw new Error("El audio OGG debe usar el códec Opus.");
  return { buffer, extension: format.extension };
}
