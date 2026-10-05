/** Only proxy the provider's known media endpoints, never an arbitrary host. */
export function ycloudMediaKind(value: string | null): "api" | "cdn" | null {
  try {
    const url = new URL(value ?? "");
    if (url.protocol !== "https:" || url.port || url.username || url.password) return null;
    if (url.hostname === "api.ycloud.com" && url.pathname.startsWith("/v2/")) return "api";
    if (url.hostname === "static-internal.ycloud.com" && url.pathname.startsWith("/yunpian/attila/inbox/message/")) return "cdn";
  } catch { /* Invalid URL. */ }
  return null;
}
