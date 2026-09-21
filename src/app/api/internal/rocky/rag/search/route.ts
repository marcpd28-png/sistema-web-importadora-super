import { internalEndpoint, limitedJson } from "@/lib/rocky/http";
import { rockyKnowledge } from "@/lib/rocky/service";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return internalEndpoint(request, async () => ({ results: await rockyKnowledge().search(await limitedJson(request)) }));
}
