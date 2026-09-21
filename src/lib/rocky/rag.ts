import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { KnowledgeHit, LLMProvider } from "./contracts";
import { expandInitialVocabulary } from "./vocabulary";

export const documentSchema = z.object({
  sourceType: z.enum(["PRODUCT", "MANUAL", "FAQ", "WARRANTY", "RETURN", "DELIVERY", "PAYMENT", "COMPATIBILITY", "INTERNAL"]),
  sourceId: z.string().min(1).max(191), title: z.string().min(1).max(240),
  text: z.string().min(1).max(80000), productId: z.string().max(191).nullable().default(null),
  brand: z.string().max(120).nullable().default(null), category: z.string().max(120).nullable().default(null),
  version: z.string().min(1).max(80), approved: z.boolean().default(false),
}).strict();
export const ragSearchSchema = z.object({
  query: z.string().min(1).max(120), mode: z.enum(["exact", "lexical", "vector", "hybrid"]).default("hybrid"),
  productId: z.string().max(191).optional(), brand: z.string().max(120).optional(), category: z.string().max(120).optional(),
  sourceType: documentSchema.shape.sourceType.optional(), limit: z.number().int().min(1).max(8).default(5),
});
export function cleanKnowledge(text: string) {
  return text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/[ \t]+/g, " ").trim();
}
export function chunkKnowledge(text: string, size = 1400, overlap = 160) {
  if (size < 200 || overlap < 0 || overlap >= size) throw new Error("INVALID_CHUNK_SIZE");
  const cleaned = cleanKnowledge(text); const chunks: string[] = [];
  for (let start = 0; start < cleaned.length; start += size - overlap) chunks.push(cleaned.slice(start, start + size));
  return chunks;
}
export function vectorLiteral(values: number[]) {
  if (values.length !== 1024 || values.some(n => !Number.isFinite(n)) || !values.some(n => n !== 0)) throw new Error("INVALID_EMBEDDING");
  return `[${values.join(",")}]`;
}
export class PostgresKnowledge {
  constructor(private provider?: LLMProvider) {}
  async index(raw: unknown) {
    const input = documentSchema.parse(raw);
    if (/ignora (?:tus|las) instrucciones|ignore (?:all|previous) instructions|\b(?:api[_ -]?key|password|access[_ -]?token)\s*[:=]/i.test(input.text)) throw new Error("UNSAFE_KNOWLEDGE_CONTENT");
    const chunks = chunkKnowledge(input.text);
    const hash = createHash("sha256").update(JSON.stringify({ ...input, text: cleanKnowledge(input.text) })).digest("hex");
    const identity = { sourceType: input.sourceType, sourceId: input.sourceId };
    const old = await prisma.knowledgeDocument.findUnique({ where: { sourceType_sourceId: identity } });
    const metadata = old?.metadata as { embeddingModel?: string } | null;
    if (old?.contentHash === hash && (!this.provider || metadata?.embeddingModel === "qwen3-embedding:0.6b")) return { id: old.id, unchanged: true };
    // Produce embeddings before taking locks; no partial index if the model is unavailable.
    const vectors: number[][] = [];
    if (this.provider) for (let i = 0; i < chunks.length; i += 4) vectors.push(...await this.provider.embed(chunks.slice(i, i + 4)));
    return prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rocky-index:${input.sourceType}:${input.sourceId}`}))`;
      const data = { sourceType: input.sourceType, sourceId: input.sourceId, title: input.title, productId: input.productId, brand: input.brand, category: input.category, version: input.version, approved: input.approved };
      const document = await tx.knowledgeDocument.upsert({ where: { sourceType_sourceId: identity },
        create: { ...data, contentHash: hash, metadata: { embeddingModel: vectors.length ? "qwen3-embedding:0.6b" : null } },
        update: { ...data, contentHash: hash, metadata: { embeddingModel: vectors.length ? "qwen3-embedding:0.6b" : null } },
      });
      await tx.knowledgeChunk.deleteMany({ where: { documentId: document.id } });
      for (let position = 0; position < chunks.length; position++) {
        const chunk = await tx.knowledgeChunk.create({ data: { documentId: document.id, position, content: chunks[position] } });
        if (vectors[position]) await tx.$executeRaw`INSERT INTO knowledge_embeddings ("chunkId", embedding, model) VALUES (${chunk.id}, ${vectorLiteral(vectors[position])}::vector, 'qwen3-embedding:0.6b')`;
      }
      return { id: document.id, unchanged: false, chunks: chunks.length, embeddings: vectors.length };
    }, { timeout: 20000 });
  }
  async remove(sourceType: string, sourceId: string) {
    return prisma.knowledgeDocument.deleteMany({ where: { sourceType, sourceId } });
  }
  async search(raw: unknown): Promise<KnowledgeHit[]> {
    const input = ragSearchSchema.parse(raw);
    if (input.mode !== "exact") input.query = expandInitialVocabulary(input.query);
    const filter = Prisma.sql`d.approved = true AND d."sourceType" <> 'INTERNAL'
      AND (${input.productId || null}::text IS NULL OR d."productId" = ${input.productId || null})
      AND (${input.brand || null}::text IS NULL OR lower(d.brand) = lower(${input.brand || null}))
      AND (${input.category || null}::text IS NULL OR lower(d.category) = lower(${input.category || null}))
      AND (${input.sourceType || null}::text IS NULL OR d."sourceType" = ${input.sourceType || null})
      AND (d."productId" IS NULL OR EXISTS (SELECT 1 FROM "Product" p WHERE p.id = d."productId" AND p."isVisible" = true))`;
    const rows = new Map<string, KnowledgeHit>();
    if (input.mode !== "vector") {
      const lexical = await prisma.$queryRaw<KnowledgeHit[]>(Prisma.sql`
        SELECT c.id, d."sourceId", d."sourceType", c.content AS text, d."productId", d.title,
          (CASE WHEN lower(d."sourceId") = lower(${input.query}) THEN 2.0 ELSE
            ts_rank_cd(to_tsvector('spanish', c.content), plainto_tsquery('spanish', ${input.query})) END)::float8 AS score
        FROM knowledge_chunks c JOIN knowledge_documents d ON d.id = c."documentId"
        WHERE ${filter} AND (lower(d."sourceId") = lower(${input.query}) OR
          (${input.mode !== "exact"} AND to_tsvector('spanish', c.content) @@ plainto_tsquery('spanish', ${input.query})))
        ORDER BY score DESC, c.id LIMIT ${input.limit * 3}`);
      lexical.forEach((row, rank) => rows.set(row.id, { ...row, score: (row.score >= 2 ? 1 : 0) + 1 / (60 + rank + 1) }));
    }
    if (input.mode === "vector" || input.mode === "hybrid") {
      if (!this.provider) {
        if (input.mode === "vector") throw new Error("EMBEDDINGS_UNAVAILABLE");
      } else {
        const [vector] = await this.provider.embed([`Instruct: Recuperar información comercial relevante para la consulta\nQuery: ${input.query}`]);
        const nearest = await prisma.$queryRaw<KnowledgeHit[]>(Prisma.sql`
          SELECT c.id, d."sourceId", d."sourceType", c.content AS text, d."productId", d.title,
            (1 - (e.embedding <=> ${vectorLiteral(vector)}::vector))::float8 AS score
          FROM knowledge_embeddings e JOIN knowledge_chunks c ON c.id = e."chunkId" JOIN knowledge_documents d ON d.id = c."documentId"
          WHERE ${filter} AND e.model = 'qwen3-embedding:0.6b' AND 1 - (e.embedding <=> ${vectorLiteral(vector)}::vector) >= 0.55
          ORDER BY e.embedding <=> ${vectorLiteral(vector)}::vector LIMIT ${input.limit * 3}`);
        nearest.forEach((row, rank) => rows.set(row.id, { ...row, score: (rows.get(row.id)?.score || 0) + 1 / (60 + rank + 1) }));
      }
    }
    return [...rows.values()].sort((a, b) => b.score - a.score).slice(0, input.limit);
  }
}
