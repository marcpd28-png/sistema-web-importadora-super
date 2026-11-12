-- Restore the authenticated, receive-only YCloud adapter. The previous
-- retirement migration preserved history but blocked new WhatsApp records.
DROP TRIGGER IF EXISTS retired_whatsapp_conversation_guard ON "Conversation";
DROP TRIGGER IF EXISTS retired_whatsapp_contact_guard ON "ChatContact";
DROP FUNCTION IF EXISTS reject_retired_whatsapp_channel();
