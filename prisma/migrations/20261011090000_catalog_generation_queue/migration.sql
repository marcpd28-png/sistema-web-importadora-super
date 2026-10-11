-- Durable, additive background rendering for on-demand catalog PDFs.
CREATE TABLE "CatalogGenerationJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sequence" SERIAL NOT NULL UNIQUE,
  "conversationId" TEXT NOT NULL REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "triggerMessageId" TEXT NOT NULL,
  "conversationRevision" INTEGER NOT NULL,
  "globalRevision" INTEGER NOT NULL,
  "inboundVersion" INTEGER,
  "scopeKey" VARCHAR(180) NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "snapshot" JSONB NOT NULL,
  "snapshotHash" VARCHAR(64) NOT NULL,
  "state" VARCHAR(32) NOT NULL DEFAULT 'queued',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "processingToken" VARCHAR(64),
  "leaseExpiresAt" TIMESTAMP(3),
  "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "result" JSONB,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "CatalogGenerationJob_conversationId_triggerMessageId_scopeKey_key" UNIQUE ("conversationId", "triggerMessageId", "scopeKey")
);
CREATE INDEX "CatalogGenerationJob_state_dueAt_sequence_idx" ON "CatalogGenerationJob"("state", "dueAt", "sequence");
CREATE INDEX "CatalogGenerationJob_conversationId_state_idx" ON "CatalogGenerationJob"("conversationId", "state");

CREATE TABLE "CatalogGenerationDelivery" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "jobId" TEXT NOT NULL REFERENCES "CatalogGenerationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "partNumber" INTEGER NOT NULL,
  "documentUrl" TEXT NOT NULL,
  "productCount" INTEGER NOT NULL,
  "messageId" TEXT UNIQUE,
  "state" VARCHAR(32) NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CatalogGenerationDelivery_jobId_partNumber_key" UNIQUE ("jobId", "partNumber")
);
CREATE INDEX "CatalogGenerationDelivery_state_jobId_idx" ON "CatalogGenerationDelivery"("state", "jobId");

-- Cancellation remains owned by the existing conversation/global controls.
-- A worker checks its token before publishing, so an in-flight renderer cannot
-- enqueue a document after a human takes over the conversation.
CREATE FUNCTION catalog_generation_conversation_control() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."automationRevision" IS DISTINCT FROM OLD."automationRevision" THEN
    UPDATE "CatalogGenerationJob"
      SET state = 'cancelled', reason = 'conversation_control_changed', "processingToken" = NULL,
          "finishedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "conversationId" = NEW.id AND state IN ('queued', 'running', 'ready');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER catalog_generation_conversation_control AFTER UPDATE ON "Conversation"
  FOR EACH ROW EXECUTE FUNCTION catalog_generation_conversation_control();

CREATE FUNCTION catalog_generation_global_control() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."automationRevision" IS DISTINCT FROM OLD."automationRevision" THEN
    UPDATE "CatalogGenerationJob"
      SET state = 'cancelled', reason = 'global_control_changed', "processingToken" = NULL,
          "finishedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE state IN ('queued', 'running', 'ready');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER catalog_generation_global_control AFTER UPDATE ON "StoreSettings"
  FOR EACH ROW EXECUTE FUNCTION catalog_generation_global_control();
