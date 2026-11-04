import sharp from "sharp";
import { convertRecordedAudio } from "./recorded-audio";

const MIB = 1024 * 1024;
const MEDIA: Record<string, { extension: string; max: number }> = {
  "video/mp4": { extension: ".mp4", max: 25 * MIB },
  "video/3gpp": { extension: ".3gp", max: 25 * MIB },
  "audio/aac": { extension: ".aac", max: 25 * MIB },
  "audio/mpeg": { extension: ".mp3", max: 25 * MIB },
  "audio/mp4": { extension: ".m4a", max: 25 * MIB },
  "audio/x-m4a": { extension: ".m4a", max: 25 * MIB },
  "audio/amr": { extension: ".amr", max: 25 * MIB },
  "audio/ogg": { extension: ".ogg", max: 25 * MIB },
  "application/pdf": { extension: ".pdf", max: 25 * MIB },
};

/** Prepare media for the connected messaging transports without coupling the
 * upload surface to a particular provider's credentials or APIs. */
export async function prepareMessagingUpload(buffer: Buffer, mime: string) {
  const normalizedMime = mime.split(";")[0].trim().toLowerCase();
  if (buffer.length > 25 * MIB || !buffer.length) throw new Error("El archivo debe tener contenido y pesar como máximo 25 MB.");
  if (normalizedMime === "audio/webm") {
    return { buffer: await convertRecordedAudio(buffer), extension: ".ogg" };
  }
  if (normalizedMime.startsWith("image/")) {
    const image = await sharp(buffer, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .toColourspace("srgb")
      .withIccProfile("srgb")
      .jpeg({ quality: 85 })
      .toBuffer();
    if (image.length > 10 * MIB) throw new Error("La imagen optimizada supera el límite de 10 MB.");
    return { buffer: image, extension: ".jpg" };
  }
  const format = MEDIA[normalizedMime];
  if (!format) throw new Error("Usa video MP4/3GP, audio MP3/M4A/AAC/AMR/OGG Opus o un PDF.");
  if (buffer.length > format.max) throw new Error("El archivo supera el tamaño permitido para mensajería.");
  if (normalizedMime === "audio/ogg" && !buffer.subarray(0, 1024).includes(Buffer.from("OpusHead"))) {
    throw new Error("El audio OGG debe usar el códec Opus.");
  }
  return { buffer, extension: format.extension };
}
