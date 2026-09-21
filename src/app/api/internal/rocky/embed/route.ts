import { z } from "zod";
import { internalEndpoint, limitedJson } from "@/lib/rocky/http";
import { OllamaLocalProvider } from "@/lib/rocky/provider";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return internalEndpoint(request, async () => {
    const { texts } = z.object({ texts: z.array(z.string().min(1).max(3000)).min(1).max(8) }).strict().parse(await limitedJson(request, 30000));
    return { model: "qwen3-embedding:0.6b", embeddings: await new OllamaLocalProvider().embed(texts) };
  });
}
