-- Durable catalog PDF delivery for Super Bot. This intentionally does not
-- reuse CatalogGenerationJob, which belongs to the legacy WhatsApp outbox.
CREATE TABLE "RockyAiCatalogJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sequence" SERIAL NOT NULL UNIQUE,
  "conversationId" TEXT NOT NULL REFERENCES "RockyAiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "draftId" TEXT NOT NULL UNIQUE REFERENCES "RockyAiDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "triggerId" VARCHAR(180) NOT NULL,
  "controlRevision" INTEGER NOT NULL,
  "settingsRevision" INTEGER NOT NULL,
  "scopeKey" VARCHAR(180) NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "snapshot" JSONB NOT NULL,
  "snapshotHash" VARCHAR(64) NOT NULL,
  "state" VARCHAR(32) NOT NULL DEFAULT 'WAITING_ACK',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "processingToken" VARCHAR(64),
  "leaseExpiresAt" TIMESTAMP(3),
  "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "result" JSONB,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3)
);
CREATE INDEX "RockyAiCatalogJob_state_dueAt_sequence_idx" ON "RockyAiCatalogJob"("state", "dueAt", "sequence");
CREATE INDEX "RockyAiCatalogJob_conversationId_state_idx" ON "RockyAiCatalogJob"("conversationId", "state");

CREATE TABLE "RockyAiCatalogDelivery" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "jobId" TEXT NOT NULL REFERENCES "RockyAiCatalogJob"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "partNumber" INTEGER NOT NULL,
  "documentUrl" TEXT NOT NULL,
  "relativeUrl" TEXT NOT NULL,
  "filename" VARCHAR(255) NOT NULL,
  "byteLength" INTEGER NOT NULL,
  "productCount" INTEGER NOT NULL,
  "state" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "providerMessageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RockyAiCatalogDelivery_jobId_partNumber_key" UNIQUE ("jobId", "partNumber")
);
CREATE INDEX "RockyAiCatalogDelivery_state_jobId_idx" ON "RockyAiCatalogDelivery"("state", "jobId");

-- A catalog may never proceed after its acknowledgement draft was discarded,
-- expired, or left in an uncertain state.
CREATE FUNCTION rocky_ai_catalog_draft_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state IN ('EXPIRED', 'DISCARDED', 'UNCERTAIN') AND NEW.state IS DISTINCT FROM OLD.state THEN
    UPDATE "RockyAiCatalogJob"
      SET state = 'CANCELLED', reason = 'draft_no_longer_sendable', "processingToken" = NULL,
          "leaseExpiresAt" = NULL, "finishedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "draftId" = NEW.id AND state IN ('WAITING_ACK', 'QUEUED', 'RENDERING', 'READY', 'DELIVERING');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rocky_ai_catalog_draft_guard AFTER UPDATE ON "RockyAiDraft"
  FOR EACH ROW EXECUTE FUNCTION rocky_ai_catalog_draft_guard();

-- A human takeover or mode/control revision has priority over a PDF job.
CREATE FUNCTION rocky_ai_catalog_conversation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.revision IS DISTINCT FROM OLD.revision
     OR (NEW."humanControl" = true AND OLD."humanControl" = false)
     OR (NEW.mode = 'OFF' AND OLD.mode IS DISTINCT FROM NEW.mode) THEN
    UPDATE "RockyAiCatalogJob"
      SET state = 'CANCELLED', reason = 'conversation_control_changed', "processingToken" = NULL,
          "leaseExpiresAt" = NULL, "finishedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "conversationId" = NEW.id AND state IN ('WAITING_ACK', 'QUEUED', 'RENDERING', 'READY', 'DELIVERING');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rocky_ai_catalog_conversation_guard AFTER UPDATE ON "RockyAiConversation"
  FOR EACH ROW EXECUTE FUNCTION rocky_ai_catalog_conversation_guard();

-- Configuration changes and the global emergency stop prevent later catalog
-- delivery even if rendering already started.
CREATE FUNCTION rocky_ai_catalog_settings_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.enabled = false OR NEW.revision IS DISTINCT FROM OLD.revision THEN
    UPDATE "RockyAiCatalogJob"
      SET state = 'CANCELLED', reason = 'settings_changed', "processingToken" = NULL,
          "leaseExpiresAt" = NULL, "finishedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE state IN ('WAITING_ACK', 'QUEUED', 'RENDERING', 'READY', 'DELIVERING');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rocky_ai_catalog_settings_guard AFTER UPDATE ON "RockyAiSettings"
  FOR EACH ROW EXECUTE FUNCTION rocky_ai_catalog_settings_guard();

-- Local channels persist all turns in ChatMessage. A fresh customer message or
-- human reply invalidates pending catalog work; social channels receive the
-- same protection from the worker's current-snapshot check.
CREATE FUNCTION rocky_ai_catalog_message_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target TEXT;
BEGIN
  SELECT lower(channel::text) || ':' || id INTO target FROM "Conversation"
    WHERE id = NEW."conversationId";
  IF NEW.direction = 'INBOUND'
     OR (NEW.direction = 'OUTBOUND' AND COALESCE(NEW.metadata->>'source', '') <> 'rocky-ai') THEN
    UPDATE "RockyAiCatalogJob"
      SET state = 'CANCELLED', reason = 'conversation_changed', "processingToken" = NULL,
          "leaseExpiresAt" = NULL, "finishedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "conversationId" = target AND state IN ('WAITING_ACK', 'QUEUED', 'RENDERING', 'READY', 'DELIVERING');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rocky_ai_catalog_message_guard AFTER INSERT ON "ChatMessage"
  FOR EACH ROW EXECUTE FUNCTION rocky_ai_catalog_message_guard();
