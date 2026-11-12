-- Additive rollout. Short lock timeout avoids blocking existing conversation traffic.
BEGIN;
SET LOCAL lock_timeout = '3s';
-- CreateTable
CREATE TABLE "RockySession" (
    "conversationId" TEXT NOT NULL,
    "mode" VARCHAR(16) NOT NULL DEFAULT 'COPILOT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "memory" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RockySession_pkey" PRIMARY KEY ("conversationId")
);

-- CreateTable
CREATE TABLE "RockyCustomerPreferences" (
    "contactId" TEXT NOT NULL,
    "preferences" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RockyCustomerPreferences_pkey" PRIMARY KEY ("contactId")
);

-- CreateTable
CREATE TABLE "RockyRun" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "triggerMessageId" TEXT NOT NULL,
    "intent" VARCHAR(40) NOT NULL,
    "skill" VARCHAR(64) NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RockyRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RockyFeedback" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "humanResponse" TEXT NOT NULL,
    "outcome" VARCHAR(80),
    "reviewerId" VARCHAR(191) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'AI_FEEDBACK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RockyFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RockySynonym" (
    "id" TEXT NOT NULL,
    "phrase" VARCHAR(120) NOT NULL,
    "canonical" VARCHAR(120) NOT NULL,
    "frequency" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "reviewedBy" VARCHAR(191),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RockySynonym_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" TEXT NOT NULL,
    "sourceType" VARCHAR(40) NOT NULL,
    "sourceId" VARCHAR(191) NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "productId" VARCHAR(191),
    "brand" VARCHAR(120),
    "category" VARCHAR(120),
    "version" VARCHAR(80) NOT NULL,
    "contentHash" VARCHAR(64) NOT NULL,
    "metadata" JSONB NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunks" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RockyRun_triggerMessageId_key" ON "RockyRun"("triggerMessageId");

-- CreateIndex
CREATE INDEX "RockyRun_conversationId_createdAt_idx" ON "RockyRun"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "RockyRun_intent_createdAt_idx" ON "RockyRun"("intent", "createdAt");

-- CreateIndex
CREATE INDEX "RockyFeedback_status_createdAt_idx" ON "RockyFeedback"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RockySynonym_phrase_canonical_key" ON "RockySynonym"("phrase", "canonical");

-- CreateIndex
CREATE INDEX "knowledge_documents_productId_idx" ON "knowledge_documents"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_documents_sourceType_sourceId_key" ON "knowledge_documents"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_chunks_documentId_position_key" ON "knowledge_chunks"("documentId", "position");

-- AddForeignKey
ALTER TABLE "RockySession" ADD CONSTRAINT "RockySession_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RockyCustomerPreferences" ADD CONSTRAINT "RockyCustomerPreferences_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ChatContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RockyRun" ADD CONSTRAINT "RockyRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RockyFeedback" ADD CONSTRAINT "RockyFeedback_runId_fkey" FOREIGN KEY ("runId") REFERENCES "RockyRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RockySession" ADD CONSTRAINT "RockySession_mode_check" CHECK (mode IN ('MANUAL', 'COPILOT', 'AUTO'));
ALTER TABLE "RockySynonym" ADD CONSTRAINT "RockySynonym_status_check" CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'));
CREATE INDEX knowledge_chunks_lexical_idx ON knowledge_chunks USING GIN (to_tsvector('spanish', content));
COMMIT;
