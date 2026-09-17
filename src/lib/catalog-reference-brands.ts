import { FacturadorClient, getFacturadorConfig } from "./facturador/client";
import { buildBrandLookup } from "./facturador/mappers";
import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";

let cached: string[] = [];
let refreshAt = 0;
let pending: Promise<string[]> | null = null;
let loaded = false;

async function cachePath() {
  // The standalone public directory is a symlink to the persistent project public folder.
  const publicRoot = await realpath(path.join(process.cwd(), "public"));
  return path.join(publicRoot, "..", ".cache", "catalog-reference-brands.json");
}

/** ERP reference data fills gaps in imported products without changing their stored metadata. */
export async function getCatalogReferenceBrands() {
  if (Date.now() < refreshAt) return cached;
  if (pending) return pending;
  pending = (async () => {
    if (!loaded) {
      loaded = true;
      try {
        const saved = JSON.parse(await readFile(await cachePath(), "utf8"));
        if (Array.isArray(saved.brands) && saved.brands.every((v: unknown) => typeof v === "string")) {
          cached = saved.brands;
          refreshAt = Number(saved.refreshAt) || 0;
        }
      } catch { /* A first deployment may have no cache. */ }
      if (Date.now() < refreshAt) return cached;
    }
    try {
      const client = new FacturadorClient({ ...getFacturadorConfig(), timeoutMs: 8000, maxRetries: 0 });
      const rows = await client.getBrands();
      const brands = [...new Set(buildBrandLookup(rows).values())].map(v => v.trim()).filter(Boolean);
      if (!brands.length) throw new Error("Empty brand registry");
      cached = brands;
      refreshAt = Date.now() + 5 * 60_000;
      try {
        const filename = await cachePath();
        await mkdir(path.dirname(filename), { recursive: true });
        const temporary = `${filename}.${process.pid}.tmp`;
        await writeFile(temporary, JSON.stringify({ brands: cached, refreshAt }));
        await rename(temporary, filename);
      } catch { /* An unwritable disk must not block a valid catalog response. */ }
    } catch {
      // Retain the last known vocabulary; local product names/codes remain searchable.
      refreshAt = Date.now() + 30_000;
    }
    return cached;
  })().finally(() => { pending = null; });
  return pending;
}
