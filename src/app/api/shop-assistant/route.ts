import { z } from "zod";
import { rockyInformationReply } from "@/lib/rocky-engine";
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
    const text = rockyInformationReply(input.data.message, !input.data.recentMessages?.some(message => message.role === "assistant"));
    return Response.json(finalizeStoreReply({ text, quickActions: [{ label: "Hablar con un asesor", href: advisorUrl }], meta: { intent: "general_information", usedOllama: false } }, advisorUrl), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(finalizeStoreReply({ text: "" }, advisorUrl), { headers: { "Cache-Control": "no-store" } });
  }
}
