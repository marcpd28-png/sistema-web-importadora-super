ALTER TABLE "RockyOutboundJob" ADD COLUMN "inboundVersion" INTEGER;
CREATE TABLE "RockyInboundTurn" (
  "conversationId" TEXT PRIMARY KEY REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "version" INTEGER NOT NULL DEFAULT 1,
  "triggerMessageId" TEXT NOT NULL,
  "messageIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "conversationRevision" INTEGER NOT NULL,
  "globalRevision" INTEGER NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "processingToken" TEXT,
  "reason" TEXT,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "RockyInboundTurn_state_dueAt_idx" ON "RockyInboundTurn"("state", "dueAt");

CREATE FUNCTION rocky_cancel_inbound_conversation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."automationRevision" IS DISTINCT FROM OLD."automationRevision" THEN
    UPDATE "RockyInboundTurn" SET state = 'cancelled', reason = 'conversation_control_changed', "updatedAt" = CURRENT_TIMESTAMP
      WHERE "conversationId" = NEW.id AND state IN ('pending', 'running');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rocky_cancel_inbound_conversation AFTER UPDATE ON "Conversation"
  FOR EACH ROW EXECUTE FUNCTION rocky_cancel_inbound_conversation();

CREATE FUNCTION rocky_cancel_inbound_global() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."automationRevision" IS DISTINCT FROM OLD."automationRevision" THEN
    UPDATE "RockyInboundTurn" SET state = 'cancelled', reason = 'global_control_changed', "updatedAt" = CURRENT_TIMESTAMP
      WHERE state IN ('pending', 'running');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rocky_cancel_inbound_global AFTER UPDATE ON "StoreSettings"
  FOR EACH ROW EXECUTE FUNCTION rocky_cancel_inbound_global();
