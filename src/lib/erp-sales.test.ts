import assert from "node:assert/strict";
import test from "node:test";
import { buildBestSellerSnapshot, extractProductSaleRecords } from "./erp-sales";
const now = new Date("2026-09-20T12:00:00Z");

test("ordena unidades vendidas y suma líneas del mismo producto", () => {
  const result = buildBestSellerSnapshot([
    { code: "A", quantity: 2, date_of_issue: "2026-09-19" },
    { code: "B", quantity: 8, date_of_issue: "2026-09-19" },
    { code: "A", quantity: 10, date_of_issue: "2026-09-18" },
    { code: "C", quantity: 500, date_of_issue: "2026-07-01" },
    { code: "D", quantity: 500, date_of_issue: "2026-10-01" },
  ], 20, now);
  assert.deepEqual(result.codes, ["A", "B"]);
  assert.equal(result.hasRealSales, true);
});
test("acepta reportes agregados del periodo y distingue acumulados", () => {
  const records = [{ code: "A", quantity: 3 }, { code: "B", quantity: 9 }];
  const period = buildBestSellerSnapshot(records, 20, now, true);
  const accumulated = buildBestSellerSnapshot(records, 20, now, false);
  assert.deepEqual(period.codes, ["B", "A"]);
  assert.equal(period.hasDatedSales, true);
  assert.equal(accumulated.hasDatedSales, false);
  assert.equal(accumulated.summary.insights[0].label, "Acumulado ERP");
});
test("no confunde stock, precio o posición del ERP con ventas", () => {
  const result = buildBestSellerSnapshot([{ code: "A", stock: 900, sale_unit_price: 200 }, { code: "B" }], 20, now);
  assert.deepEqual(result.codes, []);
  assert.equal(result.hasRealSales, false);
});
test("ignora cero, cantidades negativas y documentos anulados", () => {
  const result = buildBestSellerSnapshot([{ code: "A", quantity: 0 }, { code: "B", quantity: -5 }, { code: "C", quantity: 900, status: "ANULADO" }], 20, now, true);
  assert.deepEqual(result.codes, []);
});
test("extrae líneas con producto anidado y hereda fecha del documento sin confundir su ID", () => {
  const rows = extractProductSaleRecords({ data: [
    { id: 99, date_of_issue: "2026-09-19", items: [{ item: { id: 3, internal_id: "A" }, quantity: 7 }] },
    { id: 100, status: "cancelled", items: [{ item: { internal_id: "B" }, quantity: 800 }] },
  ] });
  assert.equal(rows.length, 1);
  assert.deepEqual(buildBestSellerSnapshot(rows, 20, now).codes, ["A"]);
});

test("el total y código de una factura no sustituyen sus productos ni false anula ventas", () => {
  const rows = extractProductSaleRecords({ code: "F001-20", quantity: 99, is_cancelled: "false", items: [
    { code: "A", quantity: 3, is_annulled: "0" },
    { code: "B", quantity: 40, is_annulled: "true" },
  ] });
  const result = buildBestSellerSnapshot(rows, 20, now, true);
  assert.deepEqual(result.codes, ["A"]);
  assert.equal(result.metrics[0].units15, 3);
});
