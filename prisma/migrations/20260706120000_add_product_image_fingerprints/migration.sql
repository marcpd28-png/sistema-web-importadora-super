ALTER TABLE "Product"
ADD COLUMN "sourceImageFingerprint" VARCHAR(64),
ADD COLUMN "sourceImageContentHash" VARCHAR(64);

CREATE INDEX "Product_updatedAt_idx" ON "Product"("updatedAt" DESC);
