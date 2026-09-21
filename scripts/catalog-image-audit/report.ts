import { readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { auditCsv, classifyPhoto, type AuditReport, type AuditRow, type PhotoScan } from "../../src/lib/catalog-image-audit";
import { resolveImageCode } from "../../src/lib/rocky/image-codes";

async function main() {
  const root = process.env.CATALOG_AUDIT_DIR || "/home/IMPORTADORA-audits/catalog-images";
  const products = JSON.parse(await readFile(path.join(root, "products-snapshot.json"), "utf8")) as { id: string; code: string; name: string; isVisible: boolean; stockUnits: number }[];
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")) as { photos: { id: string }[]; noPhotoProductIds: string[] };
  const source = await readFile(path.join(root, "ocr.jsonl"), "utf8");
  const scans = new Map<string, PhotoScan>();
  for (const line of source.split("\n").filter(Boolean)) { try { const scan = JSON.parse(line); scans.set(scan.id, scan); } catch { /* A final line can still be in flight. */ } }
  const byId = new Map(products.map(p => [p.id, p]));
  let reviews: Record<string, NonNullable<AuditRow["visualReview"]>> = {};
  try { reviews = JSON.parse(await readFile(path.join(root, "visual-reviews.json"), "utf8")); } catch { /* No visual reviews yet. */ }
  const rows: AuditRow[] = [];
  for (const item of manifest.photos) { const scan = scans.get(item.id); if (scan && byId.has(scan.productId)) rows.push(classifyPhoto(scan, byId.get(scan.productId)!)); }
  for (const id of manifest.noPhotoProductIds) {
    const p = byId.get(id)!;
    rows.push({ id: `no-photo:${id}`, productId: id, code: p.code, name: p.name, imageUrl: "", roles: [], scannedAt: "", status: "NO_IMAGE", printedCodes: [], codeEvidence: [], nameStatus: "INSUFFICIENT", nameEvidence: "", matchingWords: [], nameCoverage: 0, aliasMatch: false, reason: "No hay una fotografía del producto; imagen genérica de no disponible.", visible: p.isVisible, stock: p.stockUnits });
  }
  const counts: AuditReport["counts"] = { CODE_MATCH: 0, CODE_DIFFERENT: 0, NAME_MATCH: 0, UNVERIFIABLE: 0, NO_IMAGE: 0, ERROR: 0 };
  for (const row of rows) {
    row.autoStatus = row.status;
    const review = reviews[row.id];
    if (review && review.sha256 === row.sha256) { row.visualReview = review; row.status = review.status; row.printedCodes = review.printedCodes; row.reason = review.note; row.aliasMatch = review.printedCodes.some(code => resolveImageCode(code, [row]).codes.length > 0); }
    else if (row.status === "CODE_DIFFERENT") { row.status = "UNVERIFIABLE"; row.reason = "El OCR propone un código distinto. Pendiente de contraste visual antes de considerarlo incongruente."; }
    counts[row.status]++;
  }
  const scannedPhotos = rows.length - manifest.noPhotoProductIds.length;
  const report: AuditReport = { version: 1, generatedAt: new Date().toISOString(), complete: scannedPhotos === manifest.photos.length, totalProducts: products.length, totalPhotos: manifest.photos.length, scannedPhotos, noPhotoProducts: manifest.noPhotoProductIds.length, counts, rows };
  await writeFile(path.join(root, "report.tmp"), JSON.stringify(report)); await rename(path.join(root, "report.tmp"), path.join(root, "report.json"));
  await writeFile(path.join(root, "report.csv"), auditCsv(report));
  console.log(JSON.stringify({ ...report, rows: undefined }));
}
void main();
