import { graphGet } from "@/lib/meta-whatsapp";
import { resolveWhatsappCredentials } from "@/lib/whatsapp-credentials";
import { getMessageMedia } from "@/lib/message-media";

type MessageMedia = ReturnType<typeof getMessageMedia>;

function isMetaMediaUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && ["facebook.com", "fbcdn.net", "fbsbx.com", "whatsapp.net"].some(
        (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
      );
  } catch {
    return false;
  }
}

export async function fetchWhatsappMessageMedia(media: MessageMedia, range: string | null) {
  if (!media.mediaId || !/^\d+$/.test(media.mediaId)) {
    throw new Error("Identificador multimedia inválido.");
  }
  const { accessToken, phoneNumberId } = await resolveWhatsappCredentials(media.phoneNumberId);
  // Resolve a fresh URL for every request: Meta download URLs are short-lived.
  const file = await graphGet<{ url: string; mime_type?: string }>(
    `/${media.mediaId}?phone_number_id=${encodeURIComponent(phoneNumberId)}`, accessToken,
  );
  if (!file || typeof file.url !== "string" || !isMetaMediaUrl(file.url)) {
    throw new Error("URL de descarga multimedia inválida.");
  }
  const headers = new Headers({ Authorization: `Bearer ${accessToken}`, "Accept-Encoding": "identity" });
  if (range && /^bytes=\d*-\d*$/.test(range)) headers.set("Range", range);
  const response = await fetch(file.url, {
    headers,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status !== 200 && response.status !== 206) {
    await response.body?.cancel();
    throw new Error("No se pudo descargar el archivo multimedia.");
  }
  const mimeType = file.mime_type ?? media.mimeType ?? response.headers.get("content-type") ?? "application/octet-stream";
  const outputHeaders = new Headers({
    "Content-Type": mimeType,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": media.type === "DOCUMENT" ? "attachment" : "inline",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  });
  for (const name of ["content-length", "content-range", "accept-ranges"]) {
    const value = response.headers.get(name);
    if (value) outputHeaders.set(name, value);
  }
  return new Response(response.body, { status: response.status, headers: outputHeaders });
}
