import { z } from "zod";
import { answerSuperBot } from "@/lib/super-bot";
import { getConfiguredMessengerUrl } from "@/lib/messenger-url";
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
  const messengerUrl = await getConfiguredMessengerUrl().catch(() => undefined);
  try {
    const reply = await answerSuperBot(input.data);
    return Response.json(finalizeStoreReply(reply, messengerUrl), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(finalizeStoreReply({ text: "" }, messengerUrl), { headers: { "Cache-Control": "no-store" } });
  }
}
