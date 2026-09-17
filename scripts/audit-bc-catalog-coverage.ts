import { writeFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { createCatalogIndex, normalizeCatalogText } from "../src/lib/catalog-selection";
import { getCatalogReferenceBrands } from "../src/lib/catalog-reference-brands";

async function main() {
  const products = await prisma.product.findMany({ where: { isVisible: true }, select: {
    code: true, name: true, brand: true, category: true, categoryRef: { select: { name: true } },
  } });
  const brands = await getCatalogReferenceBrands();
  const index = createCatalogIndex(products, brands);
  const failures: { kind: string; query: string; missing?: string[]; actual?: string[] }[] = [];
  if (!brands.length) failures.push({ kind: "erp", query: "Brand reference registry unavailable" });
  for (const p of products) {
    const query = `catálogo código ${p.code}`;
    const actual = index.select(query).products.map(p => p.code);
    if (actual.length !== 1 || actual[0] !== p.code) failures.push({ kind: "sku", query, actual });
  }
  const categoryCounts: Record<string,number> = {};
  for (const category of index.categories) {
    const query = `catálogo categoría ${category}`;
    const selected = new Set(index.select(query).products.map(p => p.code));
    const expected = products.filter(p => [p.category,p.categoryRef?.name].some(v => normalizeCatalogText(v || "") === normalizeCatalogText(category)));
    const missing = expected.filter(p => !selected.has(p.code)).map(p => p.code);
    categoryCounts[category] = selected.size;
    if (missing.length) failures.push({ kind: "category", query, missing });
  }
  const brandCounts: Record<string,number> = {};
  for (const brand of index.brands) {
    const query = `catálogo marca ${brand}`;
    const selected = new Set(index.select(query).products.map(p => p.code));
    const key = ` ${normalizeCatalogText(brand)} `;
    const expected = products.filter(p => ` ${normalizeCatalogText(p.brand || p.name)} `.includes(key));
    const missing = expected.filter(p => !selected.has(p.code)).map(p => p.code);
    brandCounts[brand] = selected.size;
    if (missing.length) failures.push({ kind: "brand", query, missing });
  }
  const typeCounts: Record<string,number> = {};
  for (const type of index.types) {
    const result = index.select(`catálogo tipo ${type}`);
    const selected = new Set(result.products.map(p => p.code));
    const expected = products.filter(p => index.productType(p) === type);
    const missing = expected.filter(p => !selected.has(p.code)).map(p => p.code);
    typeCounts[type] = selected.size;
    if (!result.scoped || missing.length) failures.push({ kind: "type", query: type, missing });
  }
  const report = { checkedAt: new Date().toISOString(), products: products.length, erpBrands: brands.length,
    categories: index.categories.length, brands: index.brands.length, types: index.types.length, categoryCounts, brandCounts, typeCounts, failures };
  if (process.argv[2]) writeFileSync(process.argv[2],JSON.stringify(report,null,2));
  console.log(JSON.stringify({ ...report, categoryCounts: undefined, brandCounts: undefined, typeCounts: undefined },null,2));
  if (failures.length) process.exitCode = 1;
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Audit failed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
