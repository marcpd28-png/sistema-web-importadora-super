import { request as httpRequest } from "node:http";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { getMessagingOwnerSession } from "@/lib/auth";
import {
  parseSocialChannel,
  socialConversation,
  socialInboxApiUrl,
  socialRequest,
  SocialInboxError,
  type SocialAttachment,
  type SocialMessage,
} from "@/lib/social-inbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ channel: string; conversationId: string; messageId: string; attachmentId: string }> };
type MessageResponse = SocialMessage | { data: SocialMessage };

function failure(error: unknown) {
  return NextResponse.json(
    { error: error instanceof SocialInboxError ? error.message : "No se pudo cargar el adjunto." },
    { status: error instanceof SocialInboxError ? error.status : 502, headers: { "Cache-Control": "private, no-store" } },
  );
}

function validOpaqueId(value: string) {
  return value.length > 0 && value.length <= 200 && !/[\x00-\x1f\x7f\\/]/.test(value) && value !== "." && value !== "..";
}

function messageFromResponse(value: MessageResponse) {
  return "data" in value ? value.data : value;
}

function requestedRange(request: NextRequest) {
  const range = request.headers.get("range");
  return range && /^bytes=\d*-\d*$/.test(range) ? range : null;
}

function configuredStorageProxy() {
  const value = process.env.SOCIAL_INBOX_STORAGE_PROXY_URL;
  if (!value) return null;
  let proxy: URL;
  try {
    proxy = new URL(value);
  } catch {
    throw new SocialInboxError("Revisa la configuración de almacenamiento.");
  }
  if (proxy.protocol !== "http:" || proxy.hostname !== "127.0.0.1" || proxy.username || proxy.password) {
    throw new SocialInboxError("Revisa la configuración de almacenamiento.");
  }
  return proxy;
}

async function fetchFilesystemAttachment(source: URL, range: string | null) {
  const proxy = configuredStorageProxy();
  if (!proxy) throw new SocialInboxError("El proveedor no entregó un enlace descargable para este adjunto.", 404);

  // The provider signs `filesystem:9000`, which is only resolvable from its
  // Docker network. Keep that Host header while calling the configured local
  // loopback bridge; never accept a host supplied by the browser.
  const destination = new URL(source);
  destination.host = proxy.host;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    return await new Promise<Response>((resolve, reject) => {
      const request = httpRequest(destination, {
        method: "GET",
        headers: { Host: source.host, ...(range ? { Range: range } : {}) },
        signal: controller.signal,
      }, (response) => {
        clearTimeout(timeout);
        const headers = new Headers();
        for (const key of ["content-type", "content-length", "content-range", "accept-ranges"]) {
          const value = response.headers[key];
          if (typeof value === "string") headers.set(key, value);
        }
        resolve(new Response(Readable.toWeb(response) as ReadableStream, { status: response.statusCode || 502, headers }));
      });
      request.once("error", reject);
      request.end();
    });
  } finally {
    clearTimeout(timeout);
  }
}

function providerAttachmentUrl(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  let api: URL;
  try {
    api = new URL(socialInboxApiUrl());
  } catch {
    throw new SocialInboxError("Revisa la conexión de mensajería.");
  }
  if (api.protocol !== "https:" || api.username || api.password) {
    throw new SocialInboxError("Revisa la conexión de mensajería.");
  }
  const destination = new URL(value, api.origin);
  return destination.origin === api.origin ? destination : null;
}

async function fetchProviderAttachment(source: URL, range: string | null) {
  const token = process.env.SOCIAL_INBOX_API_TOKEN;
  if (!token) throw new SocialInboxError("La conexión de mensajería necesita configuración.", 503);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    return await fetch(source, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, ...(range ? { Range: range } : {}) },
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    throw new SocialInboxError("El proveedor no pudo entregar el adjunto.", 502);
  } finally {
    clearTimeout(timeout);
  }
}

function storageUrlFromPath(value: string | null | undefined) {
  if (!value) return null;
  const raw = value.trim();
  try {
    const absolute = new URL(raw);
    return absolute.origin === "http://filesystem:9000" && !absolute.username && !absolute.password ? absolute : null;
  } catch {
    // `originPath` is a provider storage key, not a browser URL. Keep it as a
    // path below a fixed origin, rejecting traversal and URL control syntax.
  }
  const path = raw.replace(/^\/+/, "");
  if (!path || path.length > 2048 || /[\\?#\x00-\x1f\x7f]/.test(path)) return null;
  const segments = path.split("/");
  if (!segments.every((segment) => {
    if (!segment) return false;
    try {
      const decoded = decodeURIComponent(segment);
      return decoded !== "." && decoded !== ".." && !decoded.includes("/") && !decoded.includes("\\");
    } catch {
      return false;
    }
  })) return null;
  return new URL(`/${path}`, "http://filesystem:9000");
}

async function fetchAttachment(file: SocialAttachment, range: string | null) {
  const value = file.url?.trim();
  if (value?.startsWith("/") && !value.startsWith("//")) {
    const source = providerAttachmentUrl(value);
    if (!source) throw new SocialInboxError("El proveedor no entregó un enlace descargable para este adjunto.", 404);
    return fetchProviderAttachment(source, range);
  }
  if (value) {
    try {
      const source = new URL(value);
      if (source.origin === "http://filesystem:9000") return fetchFilesystemAttachment(source, range);
    } catch {
      // Fall through to the storage paths returned with the attachment.
    }
  }
  const source = storageUrlFromPath(file.originPath) || storageUrlFromPath(file.thumbnailPath);
  if (!source) throw new SocialInboxError("El proveedor no entregó un enlace descargable para este adjunto.", 404);
  return fetchFilesystemAttachment(source, range);
}

function safeMediaType(value: string | null | undefined) {
  const type = value?.split(";", 1)[0]?.trim().toLowerCase();
  if (!type) return null;
  return new Set([
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/avif",
    "audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg", "audio/wav", "audio/webm",
    "video/mp4", "video/webm", "video/quicktime", "application/pdf", "text/plain", "text/csv",
    "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ]).has(type) ? type : null;
}

function outputHeaders(response: Response, file: SocialAttachment) {
  const contentType = safeMediaType(file.mimeType) || safeMediaType(response.headers.get("content-type")) || "application/octet-stream";
  const inline = contentType.startsWith("image/") || contentType.startsWith("audio/") || contentType.startsWith("video/");
  const headers = new Headers({
    "Content-Type": contentType,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": inline ? "inline" : "attachment",
  });
  for (const key of ["content-length", "content-range", "accept-ranges"]) {
    const value = response.headers.get(key);
    if (value) headers.set(key, value);
  }
  return headers;
}

async function serve(request: NextRequest, context: Context, headOnly: boolean) {
  const session = await getMessagingOwnerSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  try {
    const { channel: rawChannel, conversationId, messageId, attachmentId } = await context.params;
    const channel = parseSocialChannel(rawChannel);
    if (!/^\d+$/.test(conversationId) || !validOpaqueId(messageId) || !validOpaqueId(attachmentId)) {
      throw new SocialInboxError("Adjunto no válido.", 400);
    }
    const { inbox } = await socialConversation(conversationId, channel);
    const response = await socialRequest<MessageResponse>(`/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`);
    const message = messageFromResponse(response);
    if (!message || message.deletedAt || message.contactInboxId !== inbox.id) {
      throw new SocialInboxError("Adjunto no disponible.", 404);
    }
    const file = message.attachments?.find((attachment) => attachment.id === attachmentId);
    if (!file) throw new SocialInboxError("Adjunto no disponible.", 404);

    const upstream = await fetchAttachment(file, requestedRange(request));
    if (!upstream.ok) {
      await upstream.body?.cancel().catch(() => {});
      throw new SocialInboxError("El proveedor no pudo entregar el adjunto.", 502);
    }
    return new NextResponse(headOnly ? null : upstream.body, { status: upstream.status, headers: outputHeaders(upstream, file) });
  } catch (error) {
    return failure(error);
  }
}

export async function GET(request: NextRequest, context: Context) {
  return serve(request, context, false);
}

export async function HEAD(request: NextRequest, context: Context) {
  return serve(request, context, true);
}
