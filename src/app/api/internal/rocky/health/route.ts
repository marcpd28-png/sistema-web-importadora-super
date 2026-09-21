import { prisma } from "@/lib/prisma";
import { internalEndpoint } from "@/lib/rocky/http";
import { OllamaLocalProvider } from "@/lib/rocky/provider";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return internalEndpoint(request, async () => {
    const ollama = await new OllamaLocalProvider().health();
    const vector = await prisma.$queryRaw<{ installed: boolean }[]>`SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') AS installed`;
    return { service: "ROCKY", ollama, llmEnabled: process.env.ROCKY_LLM_ENABLED === "true", vectorEnabled: process.env.ROCKY_RAG_VECTOR_ENABLED === "true", pgvector: vector[0].installed,
      documents: await prisma.knowledgeDocument.count(), simulatorEnabled: process.env.ROCKY_SIMULATOR_ENABLED === "true", liveSending: process.env.ROCKY_AUTO_ENABLED === "true" };
  });
}
