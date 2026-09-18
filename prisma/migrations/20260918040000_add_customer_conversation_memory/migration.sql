CREATE TABLE "CustomerConversationMemory" (
    "contactId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "state" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerConversationMemory_pkey" PRIMARY KEY ("contactId")
);

ALTER TABLE "CustomerConversationMemory" ADD CONSTRAINT "CustomerConversationMemory_contactId_fkey"
FOREIGN KEY ("contactId") REFERENCES "ChatContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
