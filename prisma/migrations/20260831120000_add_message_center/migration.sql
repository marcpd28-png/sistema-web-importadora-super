DO $$ BEGIN
  CREATE TYPE "Channel" AS ENUM ('WHATSAPP', 'WEB');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ConversationState" AS ENUM ('AUTOMATICO', 'REQUIERE_ASESOR', 'ATENDIENDO', 'ESPERANDO_CLIENTE', 'CERRADO', 'VENTA', 'RECLAMO');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "MessageSender" AS ENUM ('CUSTOMER', 'BOT', 'AGENT', 'SYSTEM');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT', 'LOCATION', 'CONTACT', 'UNKNOWN');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ChatContact" (
  "id" TEXT NOT NULL,
  "externalId" VARCHAR(120),
  "channel" "Channel",
  "name" VARCHAR(180) NOT NULL,
  "phone" VARCHAR(32),
  "phoneNormalized" VARCHAR(32),
  "avatar" TEXT,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ChatContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Conversation" (
  "id" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "channel" "Channel" NOT NULL DEFAULT 'WHATSAPP',
  "status" "ConversationState" NOT NULL DEFAULT 'AUTOMATICO',
  "botEnabled" BOOLEAN NOT NULL DEFAULT true,
  "assignedUserId" TEXT,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "unreadCount" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ChatMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "externalMessageId" VARCHAR(120),
  "direction" "MessageDirection" NOT NULL,
  "senderType" "MessageSender" NOT NULL,
  "messageType" "MessageType" NOT NULL DEFAULT 'TEXT',
  "content" TEXT NOT NULL,
  "mediaUrl" TEXT,
  "metadata" JSONB,
  "status" VARCHAR(32),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ChatContact" ADD COLUMN IF NOT EXISTS "phoneNormalized" VARCHAR(32);
ALTER TABLE "ChatContact" ALTER COLUMN "tags" SET DEFAULT ARRAY[]::TEXT[];

CREATE UNIQUE INDEX IF NOT EXISTS "ChatContact_channel_externalId_key" ON "ChatContact"("channel", "externalId");
CREATE INDEX IF NOT EXISTS "ChatContact_phone_idx" ON "ChatContact"("phone");
CREATE INDEX IF NOT EXISTS "ChatContact_phoneNormalized_idx" ON "ChatContact"("phoneNormalized");
CREATE INDEX IF NOT EXISTS "ChatContact_name_idx" ON "ChatContact"("name");

CREATE INDEX IF NOT EXISTS "Conversation_contactId_idx" ON "Conversation"("contactId");
CREATE INDEX IF NOT EXISTS "Conversation_channel_idx" ON "Conversation"("channel");
CREATE INDEX IF NOT EXISTS "Conversation_status_idx" ON "Conversation"("status");
CREATE INDEX IF NOT EXISTS "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt" DESC);
CREATE INDEX IF NOT EXISTS "Conversation_botEnabled_idx" ON "Conversation"("botEnabled");
CREATE INDEX IF NOT EXISTS "Conversation_assignedUserId_idx" ON "Conversation"("assignedUserId");

CREATE UNIQUE INDEX IF NOT EXISTS "ChatMessage_externalMessageId_key" ON "ChatMessage"("externalMessageId");
CREATE INDEX IF NOT EXISTS "ChatMessage_conversationId_idx" ON "ChatMessage"("conversationId");
CREATE INDEX IF NOT EXISTS "ChatMessage_conversationId_createdAt_id_idx" ON "ChatMessage"("conversationId", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt" ASC);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Conversation_contactId_fkey'
  ) THEN
    ALTER TABLE "Conversation"
      ADD CONSTRAINT "Conversation_contactId_fkey"
      FOREIGN KEY ("contactId") REFERENCES "ChatContact"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Conversation_assignedUserId_fkey'
  ) THEN
    ALTER TABLE "Conversation"
      ADD CONSTRAINT "Conversation_assignedUserId_fkey"
      FOREIGN KEY ("assignedUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ChatMessage_conversationId_fkey'
  ) THEN
    ALTER TABLE "ChatMessage"
      ADD CONSTRAINT "ChatMessage_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
