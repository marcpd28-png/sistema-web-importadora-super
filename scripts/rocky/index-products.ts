import { prisma } from "../../src/lib/prisma";
import { PostgresKnowledge } from "../../src/lib/rocky/rag";
import { OllamaLocalProvider } from "../../src/lib/rocky/provider";

async function main() {
  const maximum = Number(process.argv.find(a => a.startsWith("--limit="))?.split("=")[1] || 100);
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 10000) throw new Error("INVALID_LIMIT");
  const rag = new PostgresKnowledge(process.argv.includes("--vectors") ? new OllamaLocalProvider() : undefined);
  const query = process.argv.find(a => a.startsWith("--query="))?.slice(8).slice(0, 120);
  let cursor: string | undefined; let processed = 0; let changed = 0;
  while (processed < maximum) {
    const products = await prisma.product.findMany({ where: { isVisible: true, ...(query ? { name: { contains: query, mode: "insensitive" } } : {}), ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: "asc" }, take: Math.min(50, maximum - processed),
      select: { id: true, code: true, name: true, brand: true, category: true, description: true, technicalSpecs: true, updatedAt: true,
        digitalProfile: { select: { status: true, descriptionFull: true } }, specifications: { select: { name: true, value: true }, take: 30 } } });
    if (!products.length) break;
    for (const p of products) {
      const published = p.digitalProfile?.status === "PUBLICADA";
      // Never embed dynamic price or inventory fields. Structured identifiers remain exact-searchable.
      const text = [p.code, p.name, p.brand, p.category, published ? p.digitalProfile?.descriptionFull : p.description,
        published ? p.specifications.map(s => `${s.name}: ${s.value}`).join("\n") : p.technicalSpecs].filter(Boolean).join("\n").slice(0, 80000);
      try {
        const result = await rag.index({ sourceType: "PRODUCT", sourceId: p.code, title: p.name, text, productId: p.id, brand: p.brand, category: p.category, version: p.updatedAt.toISOString(), approved: true });
        if (!result.unchanged) changed++;
      } catch { console.error(JSON.stringify({ event: "rocky.index.failed", productId: p.id })); }
      processed++; cursor = p.id;
    }
    console.log(JSON.stringify({ processed, changed, cursor }));
  }
  await prisma.$disconnect();
}
main().catch(() => { console.error("ROCKY_INDEX_FAILED"); process.exitCode = 1; });
