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
