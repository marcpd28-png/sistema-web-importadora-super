-- Adopt existing legacy commerce tables without dropping customer data.
-- CreateTable
CREATE TABLE IF NOT EXISTS "ErpEditorialWrite" (
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

    CONSTRAINT "ErpEditorialWrite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrderReview" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" VARCHAR(30) NOT NULL,
    "previousStatus" "OrderStatus" NOT NULL,
    "nextStatus" "OrderStatus" NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StorefrontCampaign" (
    "slug" VARCHAR(40) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL DEFAULT '',
    "productCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorefrontCampaign_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StoreAnalyticsEvent" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "name" VARCHAR(32) NOT NULL,
    "page" VARCHAR(16) NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "device" VARCHAR(16) NOT NULL,
    "productCode" VARCHAR(64),
    "searchTerm" VARCHAR(80),
    "resultCount" INTEGER,
    "quoteId" VARCHAR(191),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreAnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ErpEditorialWrite_productId_createdAt_idx" ON "ErpEditorialWrite"("productId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderReview_orderId_createdAt_idx" ON "OrderReview"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StoreAnalyticsEvent_quoteId_key" ON "StoreAnalyticsEvent"("quoteId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StoreAnalyticsEvent_createdAt_name_idx" ON "StoreAnalyticsEvent"("createdAt", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StoreAnalyticsEvent_sessionId_createdAt_idx" ON "StoreAnalyticsEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StoreAnalyticsEvent_productCode_createdAt_idx" ON "StoreAnalyticsEvent"("productCode", "createdAt");
DO $$ BEGIN -- AddForeignKey
ALTER TABLE "ErpEditorialWrite" ADD CONSTRAINT "ErpEditorialWrite_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN -- AddForeignKey
ALTER TABLE "OrderReview" ADD CONSTRAINT "OrderReview_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "isTest" BOOLEAN NOT NULL DEFAULT false;
