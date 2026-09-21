import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { AuditReport } from "./catalog-image-audit";

export const catalogAuditDirectory = () => process.env.CATALOG_AUDIT_DIR || "/home/IMPORTADORA-audits/catalog-images";
let cached: { modified: number; report: AuditReport } | undefined;
export async function readCatalogImageAudit(): Promise<AuditReport | null> {
  try {
    const file = path.join(catalogAuditDirectory(), "report.json");
    const info = await stat(file);
    if (cached?.modified === info.mtimeMs) return cached.report;
    const report = JSON.parse(await readFile(file, "utf8")) as AuditReport;
    if (report.version !== 1 || !Array.isArray(report.rows)) return null;
    cached = { modified: info.mtimeMs, report };
    return report;
  } catch { return null; }
}
export async function readCatalogImageAuditProgress(): Promise<{ totalPhotos: number; completedPhotos: number; running: boolean } | null> {
  try { return JSON.parse(await readFile(path.join(catalogAuditDirectory(), "progress.json"), "utf8")); } catch { return null; }
}
