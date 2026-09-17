import { FacturadorClient, getFacturadorConfig } from "./facturador/client";
import { buildBrandLookup } from "./facturador/mappers";

let cached: string[] = [];
let refreshAt = 0;
let pending: Promise<string[]> | null = null;

/** ERP reference data fills gaps in imported products without changing their stored metadata. */
export async function getCatalogReferenceBrands() {
  if (Date.now() < refreshAt) return cached;
  if (pending) return pending;
  pending = (async () => {
    try {
      const client = new FacturadorClient({ ...getFacturadorConfig(), timeoutMs: 4000, maxRetries: 0 });
      const rows = await client.getBrands();
      cached = [...new Set(buildBrandLookup(rows).values())].map(v => v.trim()).filter(Boolean);
      refreshAt = Date.now() + 5 * 60_000;
    } catch {
      // Retain the last known vocabulary; local product names/codes remain searchable.
      refreshAt = Date.now() + 30_000;
    }
    return cached;
  })().finally(() => { pending = null; });
  return pending;
}
