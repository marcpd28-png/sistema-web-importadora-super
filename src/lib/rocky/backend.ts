import { generateRequestedCatalogPdf } from "../catalog-pdf";
import { buildPublicUrl } from "../site-url";
import { matchesRequestedModel } from "./model-match";
import { prisma } from "@/lib/prisma";
import { searchInternalProducts } from "@/lib/internal-product-search";
import type { ProductFact } from "./contracts";
import { PostgresKnowledge } from "./rag";
import type { ToolBackend } from "./tools";
import { loadCommercialCatalog } from "@/lib/commercial-catalog";
import { expandInitialVocabulary } from "./vocabulary";
import { getPreferredProductImageUrl } from "../product-media";
import { catalogSubject, productSubject, businessTopics } from "./query-language";
import { PLANNING_APPROVAL, selectReviewedExamples } from "./reviewed-examples";

export function createToolBackend(rag: PostgresKnowledge, options: { catalogPdf?: boolean } = {}): ToolBackend {
  return {
    async reviewedExamples(query) {
      const rows = await prisma.rockyFeedback.findMany({ where: { status: PLANNING_APPROVAL }, orderBy: { createdAt: "desc" }, take: 200,
        select: { status: true, outcome: true, run: { select: { triggerMessageId: true } } } });
      if (!rows.length) return [];
      const messages = await prisma.chatMessage.findMany({ where: { id: { in: rows.map(row => row.run.triggerMessageId) } }, select: { id: true, content: true } });
      const questions = new Map(messages.map(row => [row.id, row.content]));
      return selectReviewedExamples(query, rows.map(row => ({ ...row, question: questions.get(row.run.triggerMessageId) || "" })));
    },
    async catalog(query) {
      const snapshot = await loadCommercialCatalog();
      const selection = snapshot.search(catalogSubject(query), false);
      if (!selection.scoped) return { scope: "FULL", label: "catálogo completo", url: buildPublicUrl("/?view=all"), count: snapshot.products.length };
      const params = new URLSearchParams({ view: "all" });
      if (selection.categories.length === 1) params.set("category", selection.categories[0]);
      if (selection.brands.length === 1) params.set("brand", selection.brands[0]);
      const terms = [...selection.types, ...selection.terms].join(" ").trim();
      if (terms) params.set("q", terms);
      else if (!selection.categories.length && !selection.brands.length) params.set("q", selection.label);
      const url = buildPublicUrl(`/?${params}`);
      if (options.catalogPdf === false) return { scope: "FILTERED", label: selection.label, url, count: selection.products.length, reason: "WEB_CATALOG" };
      try {
        const generated = await generateRequestedCatalogPdf(catalogSubject(query), false, snapshot, selection);
        return { scope: "FILTERED", label: selection.label, url, count: generated.catalog?.productCount || 0,
          ...(generated.catalog ? { document: { url: generated.catalog.absoluteUrl, name: `Catálogo de ${selection.label}.pdf` } } : { reason: "NO_AVAILABLE_CATALOG_IMAGES" }) };
      } catch { return { scope: "FILTERED", label: selection.label, url, count: 0, reason: "PDF_UNAVAILABLE" }; }
    },
    async business(query) {
      const settings = await prisma.storeSettings.findUnique({ where: { id: 1 }, select: { supportHours: true, storeAddress: true } });
      const topics = businessTopics(query);
      const fields = [topics.hours ? "supportHours" : null, topics.address ? "storeAddress" : null].filter((field): field is "supportHours" | "storeAddress" => field !== null);
      return fields.flatMap(field => {
        const value = settings?.[field]?.trim();
        return value ? [{ id: `StoreSettings:1:${field}`, sourceId: `StoreSettings:${field}`, sourceType: "BUSINESS", productId: null, score: 1,
          title: "Configuración publicada de la tienda", text: field === "supportHours" ? `Nuestro horario de atención es: ${value}. Es el horario general publicado; los cambios por feriados o excepciones requieren confirmación.` : `Nuestra dirección es: ${value}.` }] : [];
      });
    },
    async search(query, budget) {
      if (!productSubject(query)) return [];
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
          slug: true, imageUrl: true, localImageUrl: true, sourceImageUrl: true, media: { where: { type: "IMAGE" }, select: { url: true }, orderBy: { sortOrder: "asc" } },
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
        imageUrl: getPreferredProductImageUrl({ ...p, imageUrl: p.sourceImageUrl ?? p.imageUrl }), url: buildPublicUrl(`/producto/${p.slug}`),
        stockUnits: p.stockUnits, description: p.description, technicalSpecs: p.digitalProfile?.status === "PUBLICADA" && p.specifications.length ? p.specifications.map(s => `${s.name}: ${s.value}`).join("; ") : p.technicalSpecs, updatedAt: p.updatedAt.toISOString() };
    },
    knowledge: (query, productId, sourceType) => rag.search({ query, productId, sourceType }),
  };
}
