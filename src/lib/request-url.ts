export function usesLocalHttp(host: string) {
  const hostname = host.replace(/^\[|\](:\d+)?$/g, "").split(":")[0] ?? host;
  const parts = hostname.split(".").map(Number);

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".local")
  ) {
    return true;
  }

  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    return false;
  }

  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

export function buildRequestUrl(requestHeaders: Headers, path: string) {
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ?? (usesLocalHttp(host) ? "http" : "https");

  return new URL(path, `${protocol}://${host}`).toString();
}
