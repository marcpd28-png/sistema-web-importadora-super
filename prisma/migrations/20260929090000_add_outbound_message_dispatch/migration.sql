CREATE TABLE "OutboundMessageDispatch" (
  "id" TEXT NOT NULL,
  "recipient" VARCHAR(32) NOT NULL,
  "fingerprint" VARCHAR(64) NOT NULL,
  "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OutboundMessageDispatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutboundMessageDispatch_recipient_fingerprint_key"
  ON "OutboundMessageDispatch"("recipient", "fingerprint");

CREATE INDEX "OutboundMessageDispatch_reservedAt_idx"
  ON "OutboundMessageDispatch"("reservedAt");
