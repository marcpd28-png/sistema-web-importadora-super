CREATE TABLE "ErpEditorialWrite" (
    "id" VARCHAR(36) NOT NULL,
    "productId" TEXT NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'PREPARING',
    "actorEmail" TEXT NOT NULL,
    "reviewedByEmail" TEXT,
    "message" TEXT NOT NULL,
    "beforeData" JSONB,
    "requestData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ErpEditorialWrite_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ErpEditorialWrite_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ErpEditorialWrite_productId_createdAt_idx" ON "ErpEditorialWrite"("productId", "createdAt");
-- There must never be two concurrent or unresolved writes for one product.
CREATE UNIQUE INDEX "ErpEditorialWrite_unresolved_product_key"
ON "ErpEditorialWrite" ("productId") WHERE "status" IN ('PREPARING', 'SENDING', 'UNCERTAIN');
