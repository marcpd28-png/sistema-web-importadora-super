import { internalEndpoint, limitedJson } from "@/lib/rocky/http";
import { rockyKnowledge } from "@/lib/rocky/service";
import { z } from "zod";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return internalEndpoint(request, async () => rockyKnowledge().index(await limitedJson(request, 100000)));
}
export async function DELETE(request: Request) {
  return internalEndpoint(request, async () => {
    const input = z.object({ sourceType: z.string().min(1).max(40), sourceId: z.string().min(1).max(191) }).strict().parse(await limitedJson(request));
    return rockyKnowledge().remove(input.sourceType, input.sourceId);
  });
}
