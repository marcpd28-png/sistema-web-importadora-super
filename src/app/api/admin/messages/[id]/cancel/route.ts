import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cancelQueuedImage } from "@/lib/manychat-image-queue";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const { id } = await params;
  const cancelled = await cancelQueuedImage(prisma, id, session.userId);
  return Response.json({ cancelled }, { status: cancelled ? 200 : 409 });
}
