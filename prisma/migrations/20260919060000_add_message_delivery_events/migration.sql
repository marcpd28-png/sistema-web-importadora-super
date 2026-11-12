CREATE TABLE "MessageDeliveryEvent" (
  "id" VARCHAR(64) NOT NULL,
  "externalMessageId" VARCHAR(120) NOT NULL,
  "phoneNumberId" VARCHAR(120) NOT NULL,
  "recipientId" VARCHAR(40) NOT NULL,
  "status" VARCHAR(32) NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reconciledAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "errorCode" VARCHAR(40),
  CONSTRAINT "MessageDeliveryEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MessageDeliveryEvent_reconciledAt_nextAttemptAt_idx" ON "MessageDeliveryEvent"("reconciledAt", "nextAttemptAt");
CREATE INDEX "MessageDeliveryEvent_externalMessageId_idx" ON "MessageDeliveryEvent"("externalMessageId");
