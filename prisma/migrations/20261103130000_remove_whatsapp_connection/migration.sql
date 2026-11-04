-- Retire the local WhatsApp/YCloud transport without deleting customer
-- conversations. Historical Conversation/ChatMessage rows keep their channel
-- value for audit-only reads; application code no longer creates or sends on it.

UPDATE "ChatMessage"
SET "status" = 'cancelled',
    "metadata" = COALESCE("metadata", '{}'::jsonb) || '{"transportRetired":"whatsapp"}'::jsonb
WHERE "id" IN (
  SELECT "messageId"
  FROM "RockyOutboundJob"
  WHERE "state" IN ('queued', 'sending', 'pending')
);

UPDATE "ChatMessage"
SET "status" = 'cancelled',
    "metadata" = COALESCE("metadata", '{}'::jsonb) || '{"transportRetired":"whatsapp"}'::jsonb
WHERE "id" LIKE 'waout:%'
  AND "status" IN ('queued', 'sending', 'pending', 'uncertain');

DROP TRIGGER IF EXISTS rocky_conversation_control ON "Conversation";
DROP TRIGGER IF EXISTS rocky_global_control ON "StoreSettings";
DROP TRIGGER IF EXISTS rocky_human_message ON "ChatMessage";
DROP TRIGGER IF EXISTS rocky_retired_queue_guard ON "ChatMessage";
DROP TRIGGER IF EXISTS rocky_cancel_inbound_conversation ON "Conversation";
DROP TRIGGER IF EXISTS rocky_cancel_inbound_global ON "StoreSettings";

DROP FUNCTION IF EXISTS rocky_conversation_control();
DROP FUNCTION IF EXISTS rocky_global_control();
DROP FUNCTION IF EXISTS rocky_human_message();
DROP FUNCTION IF EXISTS rocky_retired_queue_guard();
DROP FUNCTION IF EXISTS rocky_cancel_inbound_conversation();
DROP FUNCTION IF EXISTS rocky_cancel_inbound_global();

DROP TABLE IF EXISTS "RockyInboundTurn";
DROP TABLE IF EXISTS "RockyOutboundJob";
DROP TABLE IF EXISTS "OutboundMessageDispatch";

-- n8n was an independently publishable response engine. Super Bot now owns
-- customer-response decisions, so remove its local builder and execution log.
DROP TABLE IF EXISTS "AutomationExecution";
DROP TABLE IF EXISTS "AutomationVersion";
DROP TABLE IF EXISTS "Automation";

-- Remove locally stored OAuth/API credentials. This does not revoke a remote
-- Meta/YCloud subscription; revoke that separately in the provider console.
DROP TABLE IF EXISTS "WhatsappIntegration";
DROP TYPE IF EXISTS "WhatsappIntegrationStatus";

ALTER TABLE "Conversation" ALTER COLUMN "channel" SET DEFAULT 'WEB';

-- Historical rows remain readable, but no direct database writer can create
-- or move a record back to the retired channel.
CREATE OR REPLACE FUNCTION reject_retired_whatsapp_channel()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."channel" = 'WHATSAPP' THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'The retired channel cannot receive new records';
    ELSIF OLD."channel" IS DISTINCT FROM 'WHATSAPP' THEN
      RAISE EXCEPTION 'The retired channel cannot receive new records';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS retired_whatsapp_conversation_guard ON "Conversation";
CREATE TRIGGER retired_whatsapp_conversation_guard
BEFORE INSERT OR UPDATE OF "channel" ON "Conversation"
FOR EACH ROW EXECUTE FUNCTION reject_retired_whatsapp_channel();

DROP TRIGGER IF EXISTS retired_whatsapp_contact_guard ON "ChatContact";
CREATE TRIGGER retired_whatsapp_contact_guard
BEFORE INSERT OR UPDATE OF "channel" ON "ChatContact"
FOR EACH ROW EXECUTE FUNCTION reject_retired_whatsapp_channel();

ALTER TABLE "StoreSettings"
  ADD COLUMN IF NOT EXISTS "messengerUrl" TEXT NOT NULL DEFAULT 'https://m.me/importacionessuperoficial';

ALTER TABLE "StoreSettings" DROP COLUMN IF EXISTS "n8nWebhookUrl";
ALTER TABLE "StoreSettings" DROP COLUMN IF EXISTS "automationRevision";
ALTER TABLE "Conversation" DROP COLUMN IF EXISTS "automationRevision";

UPDATE "StoreSettings"
SET "heroTitle" = 'Catálogo mayorista con compra y cotización directa'
WHERE "heroTitle" = 'Catálogo mayorista con pedido directo por WhatsApp';

ALTER TABLE "StoreSettings" DROP COLUMN IF EXISTS "whatsappNumber";

-- Preserve reports while using the active contact-channel vocabulary.
UPDATE "StoreAnalyticsEvent" SET "name" = 'messenger_click' WHERE "name" = 'whatsapp_click';
UPDATE "StoreAnalyticsEvent" SET "source" = 'messenger' WHERE "source" = 'whatsapp';

DO $$
BEGIN
  IF to_regclass('public."QrAnalyticsLog"') IS NOT NULL THEN
    UPDATE "QrAnalyticsLog" SET "eventType" = 'MESSENGER_FROM_QR' WHERE "eventType" = 'WHATSAPP_FROM_QR';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Quote' AND column_name = 'whatsappHref'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Quote' AND column_name = 'contactHref'
  ) THEN
    ALTER TABLE "Quote" RENAME COLUMN "whatsappHref" TO "contactHref";
  END IF;
END $$;

UPDATE "Quote"
SET "contactHref" = 'https://m.me/importacionessuperoficial'
WHERE "contactHref" ~* '(wa\\.me|whatsapp\\.com)';
