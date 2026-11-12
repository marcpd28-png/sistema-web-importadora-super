CREATE TABLE "ConversationRequestAgenda" (
    "conversationId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "state" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConversationRequestAgenda_pkey" PRIMARY KEY ("conversationId"),
    CONSTRAINT "ConversationRequestAgenda_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- This setting already exists in the BC database/schema; preserve its configured value.
ALTER TABLE "StoreSettings" ADD COLUMN IF NOT EXISTS "storeAddress" TEXT NOT NULL DEFAULT 'Jr. Huallaga 420, Cercado de Lima';
