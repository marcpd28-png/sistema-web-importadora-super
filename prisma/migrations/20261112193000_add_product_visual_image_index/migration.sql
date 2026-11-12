ALTER TABLE "Product"
ADD COLUMN IF NOT EXISTS "imageVisualHash" VARCHAR(16),
ADD COLUMN IF NOT EXISTS "imageVisualSourceKey" VARCHAR(64),
ADD COLUMN IF NOT EXISTS "imageVisualIndexedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Product_imageVisualHash_idx"
ON "Product"("imageVisualHash");

CREATE INDEX IF NOT EXISTS "Product_imageVisualIndexedAt_idx"
ON "Product"("imageVisualIndexedAt");
