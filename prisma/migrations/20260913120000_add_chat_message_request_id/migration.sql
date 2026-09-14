ALTER TABLE "ChatMessage"
  ADD COLUMN IF NOT EXISTS "requestId" VARCHAR(120);

CREATE UNIQUE INDEX IF NOT EXISTS "ChatMessage_requestId_key"
  ON "ChatMessage"("requestId");
