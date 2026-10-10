import { SocialInboxError, socialRequest } from "./social-inbox";
import { convertRecordedAudio } from "./recorded-audio";
import { request as httpRequest } from "node:http";

export const SOCIAL_FILE_LIMIT = 5 * 1024 * 1024;
const supported = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg", "audio/wav", "audio/webm", "application/pdf", "text/plain", "text/csv", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);

export async function uploadSocialFile(file: File) {
  if (!file.size || file.size > SOCIAL_FILE_LIMIT) throw new SocialInboxError("Selecciona un archivo de hasta 5 MB con contenido.", 400);
  let mimeType = file.type.split(";")[0].toLowerCase();
  if (!supported.has(mimeType)) throw new SocialInboxError("Usa una imagen JPG/PNG/GIF/WebP, video MP4, audio, PDF, Word, Excel o texto.", 400);
  let bytes = Buffer.from(await file.arrayBuffer());
  let name = file.name.replace(/[\x00-\x1f/\\]/g, "_").slice(0, 180) || "archivo";
  if (mimeType === "audio/webm") {
    bytes = Buffer.from(await convertRecordedAudio(bytes, "mp3"));
    mimeType = "audio/mpeg";
    name = name.replace(/\.[^.]+$/, "") + ".mp3";
  }
  if (bytes.length > SOCIAL_FILE_LIMIT) throw new SocialInboxError("El archivo preparado supera 5 MB.", 400);
  const upload = await socialRequest<{ path: string; uploadUrl: string }>("/media-library/files/upload-url", { fileName: name, mimeType });
  // Only the trusted provider creates the storage URL; no client-supplied URL is fetched.
  if (!upload.path || !upload.uploadUrl) throw new SocialInboxError("El servicio no pudo preparar la carga.");
  const destination = new URL(upload.uploadUrl);
  const headers: Record<string, string> = { "Content-Type": mimeType };
  // The self-hosted provider signs its Docker hostname. Preserve that signed Host
  // while reaching its existing loopback-only storage port from the store process.
  if (destination.origin === "http://filesystem:9000" && process.env.SOCIAL_INBOX_STORAGE_PROXY_URL) {
    const proxy = new URL(process.env.SOCIAL_INBOX_STORAGE_PROXY_URL);
    if (proxy.hostname !== "127.0.0.1" || proxy.protocol !== "http:") throw new SocialInboxError("Revisa la configuración de almacenamiento.");
    headers.Host = destination.host;
    destination.host = proxy.host;
  } else if (destination.protocol !== "https:") throw new SocialInboxError("El servicio no pudo preparar la carga.");
  let ok: boolean;
  try {
    if (headers.Host) {
      ok = await new Promise<boolean>((resolve, reject) => {
        const request = httpRequest(destination, { method: "PUT", headers: { ...headers, "Content-Length": String(bytes.length) }, signal: AbortSignal.timeout(45000) }, response => {
          response.resume();
          resolve((response.statusCode || 0) >= 200 && (response.statusCode || 0) < 300);
        });
        request.on("error", reject);
        request.end(bytes);
      });
    } else {
      const response = await fetch(destination, { method: "PUT", headers, body: new Uint8Array(bytes), signal: AbortSignal.timeout(45000), redirect: "error" });
      ok = response.ok;
    }
  } catch { throw new SocialInboxError("No se pudo subir el archivo. Vuelve a intentarlo.", 504); }
  if (!ok) throw new SocialInboxError("El servicio rechazó la carga del archivo.");
  const media = await socialRequest<{ id: string }>("/media-library/files", { name, path: upload.path, mimeType, size: bytes.length, folderId: null });
  if (!/^\d+$/.test(media.id)) throw new SocialInboxError("No se pudo confirmar el archivo cargado.");
  return { mediaFileId: media.id, name };
}
