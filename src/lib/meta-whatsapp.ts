export type MetaGraphDiagnostics = {
  httpStatus: number;
  code: number | null;
  subcode: number | null;
  fbtraceId: string | null;
};

export class MetaGraphError extends Error {
  diagnostics: MetaGraphDiagnostics;

  constructor(message: string, diagnostics: MetaGraphDiagnostics) {
    super(message);
    this.name = "MetaGraphError";
    this.diagnostics = diagnostics;
  }
}

function graphVersion() {
  return process.env.META_GRAPH_VERSION?.trim() || "v26.0";
}

function getErrorDetails(payload: unknown) {
  const error = payload && typeof payload === "object" && "error" in payload ? (payload as { error?: unknown }).error : null;
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const message = typeof record.message === "string" ? record.message : "Meta Graph API rechazó la solicitud.";
  return {
    message,
    code: typeof record.code === "number" ? record.code : null,
    subcode: typeof record.error_subcode === "number" ? record.error_subcode : null,
    fbtraceId: typeof record.fbtrace_id === "string" ? record.fbtrace_id : null,
  };
}

export async function graphGet<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`https://graph.facebook.com/${graphVersion()}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const details = getErrorDetails(payload);
    throw new MetaGraphError(details.message, {
      httpStatus: response.status,
      code: details.code,
      subcode: details.subcode,
      fbtraceId: details.fbtraceId,
    });
  }

  return payload as T;
}

export async function exchangeMetaAuthorizationCode(code: string) {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();

  if (!appId || !appSecret) {
    throw new Error("META_APP_ID y META_APP_SECRET deben estar configurados en el servidor.");
  }

  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    code,
  });
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI?.trim();
  if (redirectUri) params.set("redirect_uri", redirectUri);

  const response = await fetch(`https://graph.facebook.com/${graphVersion()}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok || !payload || typeof payload !== "object" || typeof (payload as { access_token?: unknown }).access_token !== "string") {
    const details = getErrorDetails(payload);
    throw new MetaGraphError(details.message, {
      httpStatus: response.status,
      code: details.code,
      subcode: details.subcode,
      fbtraceId: details.fbtraceId,
    });
  }

  return {
    accessToken: (payload as { access_token: string }).access_token,
    tokenType: typeof (payload as { token_type?: unknown }).token_type === "string" ? (payload as { token_type: string }).token_type : "Bearer",
    scopes: typeof (payload as { scopes?: unknown }).scopes === "string" ? (payload as { scopes: string }).scopes.split(",").map((scope) => scope.trim()).filter(Boolean) : [],
  };
}

export function extractWhatsappPhoneNumbers(payload: unknown): AuthorizedWhatsappPhone[] {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { data?: unknown }).data)) {
    return [];
  }

  return (payload as { data: unknown[] }).data.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || !record.id.trim()) return [];
    return [{
      id: record.id,
      displayPhoneNumber: typeof record.display_phone_number === "string" ? record.display_phone_number : null,
      verifiedName: typeof record.verified_name === "string" ? record.verified_name : null,
    }];
  });
}

export function metaErrorResponse(error: unknown) {
  if (error instanceof MetaGraphError) {
    return { message: error.message, diagnostics: error.diagnostics };
  }

  return { message: error instanceof Error ? error.message : "No se pudo completar la operación de Meta." };
}
import type { AuthorizedWhatsappPhone } from "@/lib/whatsapp-meta-schema";
