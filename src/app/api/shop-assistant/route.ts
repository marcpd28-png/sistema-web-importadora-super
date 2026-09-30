import { z } from "zod";
import { answerShopAssistant } from "@/lib/shop-assistant";
import { buildPublicWhatsappHref } from "@/lib/utils";
import { finalizeStoreReply } from "@/lib/store-reply-policy";

const schema = z.object({
  message: z.string().trim().min(1).max(1200),
  productContextCode: z.string().max(64).nullish(),
  contextCategorySlug: z.string().max(120).nullish(),
  recentMessages: z.array(z.object({ role: z.enum(["assistant", "user"]), text: z.string().max(4000) })).max(6).optional(),
});
export async function POST(request: Request) {
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Consulta no válida." }, { status: 400 });
  const advisorUrl = buildPublicWhatsappHref();
  try {
    // Same catalog service used by Rocky. No second model rewrites validated prices.
    return Response.json(finalizeStoreReply(await answerShopAssistant(input.data), advisorUrl), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(finalizeStoreReply({ text: "" }, advisorUrl), { headers: { "Cache-Control": "no-store" } });
  }
}
