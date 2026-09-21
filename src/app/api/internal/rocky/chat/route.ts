import { z } from "zod";
import { internalEndpoint, limitedJson } from "@/lib/rocky/http";
import { runRocky } from "@/lib/rocky/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return internalEndpoint(request, async () => runRocky(z.object({ conversationId: z.string().min(1).max(191), triggerMessageId: z.string().min(1).max(191) }).strict().parse(await limitedJson(request))));
}
