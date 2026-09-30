ALTER TABLE "Conversation" ADD COLUMN "automationRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StoreSettings" ADD COLUMN "automationRevision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "RockyOutboundJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sequence" SERIAL NOT NULL UNIQUE,
  "conversationId" TEXT NOT NULL REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "messageId" TEXT NOT NULL UNIQUE REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "triggerMessageId" TEXT NOT NULL,
  "conversationRevision" INTEGER NOT NULL,
  "globalRevision" INTEGER NOT NULL,
  "recipient" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'reply',
  "state" TEXT NOT NULL DEFAULT 'queued',
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3)
);
CREATE INDEX "RockyOutboundJob_state_sequence_idx" ON "RockyOutboundJob"("state", "sequence");
CREATE INDEX "RockyOutboundJob_conversationId_fingerprint_createdAt_idx" ON "RockyOutboundJob"("conversationId", "fingerprint", "createdAt");

-- Protect writes from every application version sharing this database, not
-- just the current panel. Unread counters and lastMessageAt do not cancel work.
CREATE FUNCTION rocky_conversation_control() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."assignedUserId" IS NOT NULL OR NEW.status <> 'AUTOMATICO' THEN
    NEW."botEnabled" := false;
  END IF;
  IF ROW(NEW."botEnabled", NEW.status, NEW."assignedUserId") IS DISTINCT FROM
     ROW(OLD."botEnabled", OLD.status, OLD."assignedUserId") THEN
    NEW."automationRevision" := OLD."automationRevision" + 1;
    WITH cancelled AS (
      UPDATE "RockyOutboundJob" SET state = 'cancelled', reason = 'conversation_control_changed',
        "finishedAt" = CURRENT_TIMESTAMP
      WHERE "conversationId" = NEW.id AND state = 'queued' RETURNING "messageId"
    ) UPDATE "ChatMessage" SET status = 'cancelled' WHERE id IN (SELECT "messageId" FROM cancelled);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rocky_conversation_control BEFORE UPDATE ON "Conversation"
  FOR EACH ROW EXECUTE FUNCTION rocky_conversation_control();

CREATE FUNCTION rocky_global_control() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."botMasterSwitch" IS DISTINCT FROM OLD."botMasterSwitch" THEN
    NEW."automationRevision" := OLD."automationRevision" + 1;
    WITH cancelled AS (
      UPDATE "RockyOutboundJob" SET state = 'cancelled', reason = 'global_control_changed',
        "finishedAt" = CURRENT_TIMESTAMP WHERE state = 'queued' RETURNING "messageId"
    ) UPDATE "ChatMessage" SET status = 'cancelled' WHERE id IN (SELECT "messageId" FROM cancelled);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rocky_global_control BEFORE UPDATE ON "StoreSettings"
  FOR EACH ROW EXECUTE FUNCTION rocky_global_control();

-- A human message pauses even if a legacy importer forgets to update the chat.
CREATE FUNCTION rocky_human_message() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.direction = 'OUTBOUND' AND NEW."senderType" = 'AGENT' THEN
    UPDATE "Conversation" SET "botEnabled" = false, status = 'ATENDIENDO'
      WHERE id = NEW."conversationId";
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rocky_human_message AFTER INSERT ON "ChatMessage"
  FOR EACH ROW EXECUTE FUNCTION rocky_human_message();

-- Retired producers cannot refill the historical queues after cutover.
-- Simulation messages marked 'sent' remain untouched; they do not use transport.
CREATE FUNCTION rocky_retired_queue_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."senderType" = 'BOT' AND NEW.direction = 'OUTBOUND'
     AND NEW.status IN ('bc_queued', 'bc_sending', 'queued', 'pending')
     AND (NEW.metadata->>'dispatcher') IS DISTINCT FROM 'rocky-outbox-v1' THEN
    NEW.status := 'cancelled';
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || '{"cancellationReason":"retired_automatic_producer"}'::jsonb;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rocky_retired_queue_guard BEFORE INSERT OR UPDATE OF status ON "ChatMessage"
  FOR EACH ROW EXECUTE FUNCTION rocky_retired_queue_guard();
