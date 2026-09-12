-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN "clientRequestId" VARCHAR(120);

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_clientRequestId_key" ON "ChatMessage"("clientRequestId");
