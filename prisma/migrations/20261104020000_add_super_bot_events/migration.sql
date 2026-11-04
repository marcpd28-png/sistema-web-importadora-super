-- Operational telemetry and durable idempotency for automatic Super Bot
-- replies. Provider conversations remain the source of customer message data.
CREATE TYPE "SuperBotEventStatus" AS ENUM ('PROCESSING', 'RESPONDED', 'PAUSED', 'FAILED');

CREATE TABLE "SuperBotEvent" (
  "id" TEXT NOT NULL,
  "externalEventId" VARCHAR(160),
  "requestFingerprint" VARCHAR(64),
  "channel" VARCHAR(32) NOT NULL DEFAULT 'unknown',
  "conversationRef" VARCHAR(160),
  "status" "SuperBotEventStatus" NOT NULL DEFAULT 'PROCESSING',
  "leaseVersion" INTEGER NOT NULL DEFAULT 0,
  "responsePayload" JSONB,
  "intent" VARCHAR(120),
  "productsCount" INTEGER NOT NULL DEFAULT 0,
  "latencyMs" INTEGER,
  "errorCode" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SuperBotEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SuperBotEvent_externalEventId_key" ON "SuperBotEvent"("externalEventId");
CREATE INDEX "SuperBotEvent_createdAt_idx" ON "SuperBotEvent"("createdAt" DESC);
CREATE INDEX "SuperBotEvent_status_createdAt_idx" ON "SuperBotEvent"("status", "createdAt" DESC);
CREATE INDEX "SuperBotEvent_channel_createdAt_idx" ON "SuperBotEvent"("channel", "createdAt" DESC);
