function normalizeBaseUrl(value: string) {
  const candidate = /^https?:\/\//i.test(value)
    ? value
    : `https://${value}`;
  const url = new URL(candidate);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Public app URL must use HTTP or HTTPS.");
  }

  return url.toString().replace(/\/$/, "");
}

export function getServerPublicBaseUrl(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const explicit =
    environment.NEXT_PUBLIC_APP_URL?.trim() ||
    environment.NEXT_PUBLIC_SITE_URL?.trim();

  if (explicit) return normalizeBaseUrl(explicit);

  const vercelUrl = environment.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelUrl) return normalizeBaseUrl(vercelUrl);

  return environment.NODE_ENV === "production"
    ? "https://tiendavirtualsuper.com"
    : "http://localhost:3000";
}

export function resolveServerMediaUrl(
  value: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const mediaUrl = value.trim();
  if (!mediaUrl) throw new Error("mediaUrl is required");

  const absolute = new URL(
    mediaUrl,
    `${getServerPublicBaseUrl(environment)}/`,
  );
  if (!["http:", "https:"].includes(absolute.protocol)) {
    throw new Error("mediaUrl must use HTTP or HTTPS");
  }

  return absolute.toString();
}
