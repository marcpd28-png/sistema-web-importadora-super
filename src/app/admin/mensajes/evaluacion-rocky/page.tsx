import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadRecentRockyReview, ROCKY_REVIEW_HOURS } from "@/lib/rocky/recent-review";
import { RockyReviewWorkspace } from "@/components/admin/messages/rocky-review/RockyReviewWorkspace";

export const dynamic = "force-dynamic";

export default async function RockyReviewPage() {
  await requireAdmin();
  const [{ now }] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT NOW() AS now`;
  const since = new Date(now.getTime() - ROCKY_REVIEW_HOURS * 60 * 60 * 1000);
  const conversations = await loadRecentRockyReview(since);
  return <RockyReviewWorkspace conversations={conversations} since={since.toISOString()} hours={ROCKY_REVIEW_HOURS} />;
}
