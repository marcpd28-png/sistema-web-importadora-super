import { prisma } from "@/lib/prisma";
import { createTelegramProductImageHandler } from "@/lib/telegram-product-image-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 20;

// This route is intentionally public so Telegram can download a photo, but
// the handler only exposes a JPEG derivative of a visible product's local
// image. It never fetches an arbitrary URL or accepts a file path from a
// request.
export const GET = createTelegramProductImageHandler({
  findVisibleProductByCode: (code) => prisma.product.findFirst({
    where: { code, isVisible: true },
    select: {
      localImageUrl: true,
      media: {
        where: { type: "IMAGE" },
        orderBy: { sortOrder: "asc" },
        take: 4,
        select: { type: true, url: true },
      },
    },
  }),
});
