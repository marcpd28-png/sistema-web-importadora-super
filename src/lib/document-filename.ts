/** User-facing filename; never use a message caption as a filename. */
export function documentFilename(url: string) {
  try {
    const pathname = new URL(url, "https://local.invalid").pathname;
    const catalog = pathname.match(/^\/uploads\/catalogs\/catalogo-(.+)-[a-f0-9]{16}\.pdf$/i);
    if (catalog) return `Catálogo de ${decodeURIComponent(catalog[1]).replace(/-/g, " ")}.pdf`;
    const name = decodeURIComponent(pathname.split("/").pop() || "");
    return /\.[a-z0-9]{2,8}$/i.test(name) ? name.replace(/[\\/\x00-\x1f]/g, "_").slice(0, 180) : "Documento adjunto";
  } catch { return "Documento adjunto"; }
}

/** Prefer the provider's original filename over an opaque storage identifier. */
export function documentAttachmentName(url: string, metadata?: unknown) {
  const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const originalName = record(metadata).filename ?? record(record(record(metadata).raw).document).filename;
  if (typeof originalName === "string" && originalName.trim()) {
    return originalName.replace(/[\\/\x00-\x1f]/g, "_").trim().slice(0, 180);
  }
  const name = documentFilename(url);
  return /^[a-f0-9]{24,}\.pdf$/i.test(name) ? "Documento.pdf" : name;
}
