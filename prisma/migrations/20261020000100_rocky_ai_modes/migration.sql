-- CreateEnum
CREATE TYPE "RockyAiMode" AS ENUM ('OFF', 'COPILOT', 'HYBRID', 'AUTO');

-- CreateTable
CREATE TABLE "RockyAiSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
    "dailyRequests" INTEGER NOT NULL DEFAULT 200,
    "dailyTokens" INTEGER NOT NULL DEFAULT 200000,
    "maxOutputTokens" INTEGER NOT NULL DEFAULT 700,
    "channelDefaults" JSONB NOT NULL DEFAULT '{}',
    "defaultsSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "policies" JSONB NOT NULL DEFAULT '{}',
    "workerSeenAt" TIMESTAMP(3),
    "workerError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RockyAiSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RockyAiConversation" (
    "id" TEXT NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "externalId" VARCHAR(180) NOT NULL,
    "mode" "RockyAiMode" NOT NULL DEFAULT 'OFF',
    "humanControl" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "lastTrigger" TEXT,
    "lastError" TEXT,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RockyAiConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RockyAiDraft" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "triggerId" TEXT NOT NULL,
    "contextHash" TEXT NOT NULL,
    "controlRevision" INTEGER NOT NULL,
    "settingsRevision" INTEGER NOT NULL,
    "state" VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
    "text" TEXT NOT NULL,
    "decision" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "reason" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RockyAiDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RockyAiUsage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'RESERVED',
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "reservedTokens" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RockyAiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RockyAiAudit" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RockyAiAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RockyAiConversation_mode_humanControl_idx" ON "RockyAiConversation"("mode", "humanControl");

-- CreateIndex
CREATE UNIQUE INDEX "RockyAiConversation_channel_externalId_key" ON "RockyAiConversation"("channel", "externalId");

-- CreateIndex
CREATE INDEX "RockyAiDraft_conversationId_createdAt_idx" ON "RockyAiDraft"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "RockyAiDraft_state_createdAt_idx" ON "RockyAiDraft"("state", "createdAt");

-- CreateIndex
CREATE INDEX "RockyAiUsage_createdAt_idx" ON "RockyAiUsage"("createdAt");

-- CreateIndex
CREATE INDEX "RockyAiAudit_conversationId_createdAt_idx" ON "RockyAiAudit"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "RockyAiDraft" ADD CONSTRAINT "RockyAiDraft_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "RockyAiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Invalidate in the same commit as receipt, even for legacy/imported messages.
-- A dispatcher already past SENDING may complete; it is never retried blindly.
CREATE FUNCTION rocky_ai_message_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target TEXT;
BEGIN
  SELECT lower(channel::text) || ':' || id INTO target FROM "Conversation"
    WHERE id = NEW."conversationId";
  IF NEW.direction = 'INBOUND' OR
     (NEW.direction = 'OUTBOUND' AND COALESCE(NEW.metadata->>'source', '') <> 'rocky-ai') THEN
    UPDATE "RockyAiConversation"
      SET revision = revision + 1,
          "humanControl" = CASE WHEN NEW.direction = 'OUTBOUND' THEN true ELSE "humanControl" END,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = target;
    UPDATE "RockyAiDraft" SET state = 'EXPIRED', reason = 'Nuevo mensaje en la conversación.',
      "updatedAt" = CURRENT_TIMESTAMP
      WHERE "conversationId" = target AND state IN ('DRAFT', 'QUEUED');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rocky_ai_message_guard AFTER INSERT ON "ChatMessage"
  FOR EACH ROW EXECUTE FUNCTION rocky_ai_message_guard();

CREATE FUNCTION rocky_ai_global_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."botMasterSwitch" = false AND OLD."botMasterSwitch" IS DISTINCT FROM NEW."botMasterSwitch" THEN
    UPDATE "RockyAiSettings" SET enabled = false, revision = revision + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = 1;
    UPDATE "RockyAiDraft" SET state = 'EXPIRED', reason = 'Automatización global detenida.', "updatedAt" = CURRENT_TIMESTAMP
      WHERE state IN ('DRAFT', 'QUEUED');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rocky_ai_global_guard AFTER UPDATE OF "botMasterSwitch" ON "StoreSettings"
  FOR EACH ROW EXECUTE FUNCTION rocky_ai_global_guard();
