ALTER TABLE "ChatContact" ADD COLUMN IF NOT EXISTS "manychatSubscriberId" VARCHAR(120);
CREATE INDEX IF NOT EXISTS "ChatContact_manychatSubscriberId_idx" ON "ChatContact"("manychatSubscriberId");
