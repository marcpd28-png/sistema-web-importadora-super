import test from "node:test";
import assert from "node:assert/strict";
import { auditCsv, classifyPhoto, type PhotoScan, type AuditReport } from "./catalog-image-audit";
import { matchCatalogImageName } from "./rocky/image-names";

const product = { code: "05703", name: "(N1123) MICROFONO PARA CASCO HELMET COD. Q28", isVisible: true, stockUnits: 10 };
const scan: PhotoScan = { id: "photo", productId: "id", code: product.code, name: product.name, imageUrl: "/uploads/one.jpg", roles: ["PORTADA"], scannedAt: "2026-09-21", status: "SCANNED", reads: [], text: [] };
const readings = (code: string, confidence = 94) => ["full-11", "header"].map(view => ({ code, confidence, view, label: "CODIGO", box: [1, 2, 3, 4] }));

test("unreadable photos are not marked incongruent", () => {
  assert.equal(classifyPhoto(scan, product).status, "UNVERIFIABLE");
  assert.equal(classifyPhoto({ ...scan, reads: readings("N999", 84) }, product).status, "UNVERIFIABLE");
  assert.equal(classifyPhoto({ ...scan, reads: [readings("N999")[0], readings("N999")[0]] }, product).status, "UNVERIFIABLE");
});
test("different internal and printed codes can still identify the same product", () => {
  const result = classifyPhoto({ ...scan, reads: readings("N1123") }, product);
  assert.equal(result.status, "CODE_DIFFERENT"); assert.equal(result.aliasMatch, true);
  assert.match(result.reason, /no implica que la foto sea incorrecta/);
});
test("known code mismatch does not become a match through O/0 substitution", () => {
  assert.equal(classifyPhoto({ ...scan, reads: readings("N13O1") }, { ...product, code: "N1301" }).status, "CODE_DIFFERENT");
  assert.equal(classifyPhoto({ ...scan, reads: readings("(N1301)") }, { ...product, code: "N1301" }).status, "CODE_MATCH");
});
test("multiple printed references remain unresolved", () => {
  const result = classifyPhoto({ ...scan, reads: [...readings("N1123"), ...readings("Q28")] }, product);
  assert.equal(result.status, "UNVERIFIABLE"); assert.equal(result.printedCodes.length, 2);
});
test("name evidence is kept even when code is different", () => {
  const p = { ...product, name: "TALADRO INALAMBRICO LANTUN N2339" };
  const text = ["full-11", "full-6"].map(view => ({ text: p.name, confidence: 95, view }));
  const result = classifyPhoto({ ...scan, reads: readings("N2339"), text }, p);
  assert.equal(result.status, "CODE_DIFFERENT"); assert.equal(result.nameStatus, "MATCH");
  assert.equal(classifyPhoto({ ...scan, text }, p).status, "NAME_MATCH");
});
test("runtime name matching needs specific details in independent views", () => {
  const products = [{ code: "P1", name: "Taladro inalambrico Lantun SIL407" }, { code: "P2", name: "Taladro inalambrico Lantun SIL999" }];
  const text = ["full-11", "full-6"].map(view => ({ text: "TALADRO INALAMBRICO LANTUN SIL407", confidence: 95, view }));
  assert.deepEqual(matchCatalogImageName(text, products), ["P1"]);
  assert.deepEqual(matchCatalogImageName(text.slice(0, 1), products), []);
  assert.deepEqual(matchCatalogImageName(text.map(line => ({ ...line, text: "TALADRO INALAMBRICO" })), products), []);
});
test("name-only variants remain choices and generic or unreliable text is rejected", () => {
  const products = [{ code: "AU30-BLANCO", name: "(AU30) AUDIFONO ALAMBRICO AK6 ARES BLANCO" }, { code: "AU30-NEGRO", name: "(AU30) AUDIFONO ALAMBRICO AK6 ARES NEGRO" }];
  const text = ["full-11", "full-6"].map(view => ({ text: "AUDÍFONOS AK6 ARES", confidence: 91, view }));
  assert.deepEqual(matchCatalogImageName(text, products), ["AU30-BLANCO", "AU30-NEGRO"]);
  assert.deepEqual(matchCatalogImageName(text.map(line => ({ ...line, confidence: 69 })), products), []);
  assert.deepEqual(matchCatalogImageName(text.map(line => ({ ...line, text: "AUDIFONO ALAMBRICO ORIGINAL" })), products), []);
});
test("CSV exports every row without formula execution or broken quoting", () => {
  const row = classifyPhoto({ ...scan, reads: readings("N1123") }, { ...product, name: '=HYPERLINK("bad")' });
  const report = { rows: [row] } as AuditReport;
  const csv = auditCsv(report);
  assert.ok(csv.includes("'=HYPERLINK")); assert.ok(csv.includes('""bad""'));
  assert.equal(csv.split("\r\n").length, 2);
});
