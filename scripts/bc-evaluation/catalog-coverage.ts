/** Read-only coverage of the real inventory through the same agenda and catalog index as BC. */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { emptyAgenda, planRequests } from "../../src/lib/bc-request-agenda";
import { createCatalogIndex } from "../../src/lib/catalog-selection";

async function main() {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  require("@next/env").loadEnvConfig(process.cwd());
  const { PrismaClient } = require("@prisma/client") as typeof import("@prisma/client");
  const db = new PrismaClient();
  try {
    const products = await db.product.findMany({ where: { isVisible: true, stockUnits: { gt: 0 } }, select: {
      code: true, name: true, brand: true, category: true, categoryRef: { select: { name: true } },
      specifications: { select: { name: true, value: true } }, unitPrice: true,
    } });
    let brands: string[] = [];
    try { brands = JSON.parse(fs.readFileSync(".cache/catalog-reference-brands.json", "utf8")).brands; } catch { /* Inventory remains authoritative. */ }
    const index = createCatalogIndex(products, brands);
    const corpusPath = process.argv[2];
    if (!corpusPath) throw new Error("Pass the saved coverage cases.json path");
    const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));
    const results = corpus.cases.map((item: { id: string; sourceGroup: string; messages: string[]; expectedCodes: string[] }) => {
      const { agenda } = planRequests(emptyAgenda(), item.messages.map((content, i) => ({ id: `m${i}`, content })));
      const selected = [...new Set(agenda.topics.flatMap(topic => index.select(topic.query).products.map(product => product.code)))];
      const matching = selected.filter(code => item.expectedCodes.includes(code));
      return { id: item.id, group: item.sourceGroup, query: item.messages.join(" | "), subjects: agenda.topics.map(topic => topic.query),
        expected: item.expectedCodes.length, returned: selected.length, matching: matching.length, missing: item.expectedCodes.filter(code => !selected.includes(code)),
        pass: matching.length > 0, codes: selected };
    });
    const codeFailures = products.filter((product: { code: string }) => {
      const selected = index.select(`código ${product.code}`).products;
      return selected.length !== 1 || selected[0].code !== product.code;
    }).map((product: { code: string }) => product.code);
    const report = { at: new Date().toISOString(), totalProducts: products.length, codeFailures,
      groups: Object.fromEntries([...new Set(results.map((item: { group: string }) => item.group))].map(group => {
        const items = results.filter((item: { group: string }) => item.group === group);
        return [String(group), { total: items.length, pass: items.filter((item: { pass: boolean }) => item.pass).length,
          fullExpectedCoverage: items.filter((item: { missing: string[] }) => !item.missing.length).length }];
      })),
      failures: results.filter((item: { pass: boolean }) => !item.pass), results,
      brandCount: index.brands.length,
    };
    const output = process.argv[3];
    if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, results: undefined }, null, 2));
    if (codeFailures.length || report.failures.length) process.exitCode = 1;
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
