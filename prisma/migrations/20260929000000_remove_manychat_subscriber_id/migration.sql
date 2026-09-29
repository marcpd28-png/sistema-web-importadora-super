DROP INDEX IF EXISTS "ChatContact_manychatSubscriberId_key";

ALTER TABLE "ChatContact"
DROP COLUMN IF EXISTS "manychatSubscriberId";
