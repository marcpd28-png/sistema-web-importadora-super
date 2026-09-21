import { matchesRequestedModel } from "./model-match";
import { businessQuestion } from "../business-question";
import { prisma } from "@/lib/prisma";
import { searchInternalProducts } from "@/lib/internal-product-search";
import type { ProductFact } from "./contracts";
import { PostgresKnowledge } from "./rag";
import type { ToolBackend } from "./tools";
import { loadCommercialCatalog } from "@/lib/commercial-catalog";
import { expandInitialVocabulary } from "./vocabulary";

export function createToolBackend(rag: PostgresKnowledge): ToolBackend {
  return {
    async business(query) {
      const settings = await prisma.storeSettings.findUnique({ where: { id: 1 }, select: { supportHours: true, storeAddress: true } });
      const hours = businessQuestion(query) === "HOURS";
      const field = hours ? "supportHours" : "storeAddress";
      const value = settings?.[field]?.trim();
      if (!value) return [];
      return [{ id: `StoreSettings:1:${field}`, sourceId: `StoreSettings:${field}`, sourceType: "BUSINESS", productId: null, score: 1,
        title: "Configuración publicada de la tienda", text: hours ? `Nuestro horario de atención es: ${value}. Es el horario general publicado; los cambios por feriados o excepciones requieren confirmación.` : `Nuestra dirección es: ${value}.` }];
    },
    async search(query, budget) {
      query = expandInitialVocabulary(query);
      const aliases = await prisma.rockySynonym.findMany({ where: { phrase: { equals: query, mode: "insensitive" }, status: "APPROVED" }, take: 3 });
      const candidates = (await searchInternalProducts({ query, limit: 8 })).filter(p => matchesRequestedModel(query, p));
      if (!candidates.length) {
        const catalog = await loadCommercialCatalog();
        const matches = catalog.search(query, false).products;
        for (const p of matches.slice(0, 12)) candidates.push({
          id: p.id, code: p.code, slug: p.slug, name: p.name, brand: p.brand, category: p.category,
          unitPrice: Number(p.unitPrice), wholesalePrice: p.wholesalePrice === null ? null : Number(p.wholesalePrice), wholesaleMinQty: p.wholesaleMinQty,
          boxPrice: p.boxPrice === null ? null : Number(p.boxPrice), unitsPerBox: p.unitsPerBox, stockUnits: p.stockUnits,
          description: p.digitalProfile?.status === "PUBLICADA" ? p.digitalProfile.descriptionFull : null,
          technicalSpecs: p.digitalProfile?.status === "PUBLICADA" ? p.specifications.map(s => `${s.name}: ${s.value}`).join("; ") : null,
          imageUrl: p.imageUrl, url: `/producto/${p.slug}`,
        });
      }
      for (const alias of aliases) candidates.push(...await searchInternalProducts({ query: alias.canonical, limit: 5 }));
      return [...new Map(candidates.map(p => [p.id, p])).values()].filter(p => budget == null || p.unitPrice <= budget).slice(0, 8);
    },
    async product(code): Promise<ProductFact | null> {
      const p = await prisma.product.findFirst({ where: { isVisible: true, OR: [{ id: code }, { code: { equals: code, mode: "insensitive" } }, { externalCode: { equals: code, mode: "insensitive" } }, { externalId: code }] },
        select: { id: true, code: true, name: true, brand: true, category: true, unitPrice: true, wholesalePrice: true, wholesaleMinQty: true, stockUnits: true, description: true, technicalSpecs: true, updatedAt: true,
          digitalProfile: { select: { status: true } }, specifications: { select: { name: true, value: true }, orderBy: { sortOrder: "asc" }, take: 20 } } });
      if (!p) {
        if (code.length > 64) return null;
        // A commercial model (LK618) can differ from the ERP code (N1052).
        // Resolve only one exact model token; never silently choose between variants.
        const token = new RegExp(`(?:^|[^A-Z0-9])${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^A-Z0-9])`, "i");
        const candidates = (await searchInternalProducts({ query: code, limit: 20 })).filter(row => token.test(row.name));
        return candidates.length === 1 ? this.product(candidates[0].id) : null;
      }
      return { id: p.id, code: p.code, name: p.name, brand: p.brand, category: p.category, unitPrice: Number(p.unitPrice), wholesalePrice: p.wholesalePrice === null ? null : Number(p.wholesalePrice), wholesaleMinQty: p.wholesaleMinQty,
        stockUnits: p.stockUnits, description: p.description, technicalSpecs: p.digitalProfile?.status === "PUBLICADA" && p.specifications.length ? p.specifications.map(s => `${s.name}: ${s.value}`).join("; ") : p.technicalSpecs, updatedAt: p.updatedAt.toISOString() };
    },
    knowledge: (query, productId, sourceType) => rag.search({ query, productId, sourceType }),
  };
}
