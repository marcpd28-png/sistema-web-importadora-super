-- Super Bot keeps verifiable visual-analysis results separately from messages.
-- Raw provider URLs and media bytes are deliberately not persisted here.

-- CreateEnum
CREATE TYPE "RockyAiVisualStatus" AS ENUM (
  'PENDING',
  'ANALYZING',
  'VERIFIED_EXACT',
  'CANDIDATES',
  'UNVERIFIED',
  'UNSUPPORTED',
  'FAILED'
);

-- CreateTable
CREATE TABLE "RockyAiVisualEvidence" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "triggerId" VARCHAR(180) NOT NULL,
  "sourceHash" VARCHAR(64),
  "mimeType" VARCHAR(80),
  "byteLength" INTEGER,
  "status" "RockyAiVisualStatus" NOT NULL DEFAULT 'PENDING',
  "verifiedProductId" VARCHAR(191),
  "candidateProductIds" JSONB NOT NULL DEFAULT '[]',
  "evidence" JSONB,
  "analyzer" VARCHAR(120),
  "failureCode" VARCHAR(80),
  "analysisLeaseUntil" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RockyAiVisualEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RockyAiVisualEvidence_conversationId_triggerId_key"
  ON "RockyAiVisualEvidence"("conversationId", "triggerId");

-- CreateIndex
CREATE INDEX "RockyAiVisualEvidence_status_updatedAt_idx"
  ON "RockyAiVisualEvidence"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "RockyAiVisualEvidence_expiresAt_idx"
  ON "RockyAiVisualEvidence"("expiresAt");

-- AddForeignKey
ALTER TABLE "RockyAiVisualEvidence"
  ADD CONSTRAINT "RockyAiVisualEvidence_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "RockyAiConversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
