CREATE TABLE "StoreAnalyticsEvent" (
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
CREATE UNIQUE INDEX "StoreAnalyticsEvent_quoteId_key" ON "StoreAnalyticsEvent"("quoteId");
CREATE INDEX "StoreAnalyticsEvent_createdAt_name_idx" ON "StoreAnalyticsEvent"("createdAt", "name");
CREATE INDEX "StoreAnalyticsEvent_sessionId_createdAt_idx" ON "StoreAnalyticsEvent"("sessionId", "createdAt");
CREATE INDEX "StoreAnalyticsEvent_productCode_createdAt_idx" ON "StoreAnalyticsEvent"("productCode", "createdAt");
