import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function POST(request: Request) {
  await requireAdmin();
  const input = z.object({ conversationId: z.string().min(1).max(120), ids: z.array(z.string().min(1).max(120)).max(200) }).safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const items = await prisma.chatMessage.findMany({
    where: { conversationId: input.data.conversationId, id: { in: input.data.ids }, direction: "OUTBOUND" },
    select: { id: true, status: true, metadata: true, externalMessageId: true },
  });
  return Response.json({ items });
}
