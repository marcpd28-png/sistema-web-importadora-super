-- The previous counter also included automated outgoing messages and was only
-- cleared in the browser. Reset it once so new counts start from a reliable
-- baseline, then persist the time an advisor opens a conversation.
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "lastReadAt" TIMESTAMP(3);

UPDATE "Conversation"
SET "unreadCount" = 0,
    "lastReadAt" = CURRENT_TIMESTAMP
WHERE "unreadCount" <> 0;
