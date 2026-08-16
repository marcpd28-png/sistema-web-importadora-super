export function getSafeMediaUrl(url: string | null | undefined) {
  const value = url?.trim();

  if (!value) {
    return null;
  }

  if (value.startsWith("/")) {
    return encodeURI(value);
  }

  try {
    const parsedUrl = new URL(value);

    if (parsedUrl.protocol === "http:") {
      parsedUrl.protocol = "https:";
    }

    return parsedUrl.toString();
  } catch {
    return encodeURI(value);
  }
}

export function getOptimizedImageUrl(
  url: string | null | undefined,
  width = 384,
  quality = 75,
) {
  const safeUrl = getSafeMediaUrl(url);

  if (!safeUrl) {
    return null;
  }

  if (safeUrl.startsWith("/_next/image")) {
    return safeUrl;
  }

  return `/_next/image?url=${encodeURIComponent(safeUrl)}&w=${width}&q=${quality}`;
}

