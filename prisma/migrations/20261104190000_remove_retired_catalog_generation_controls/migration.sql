-- The legacy catalog-generation queue was retired with the WhatsApp outbox.
-- Its controls still referenced `automationRevision`, which was subsequently
-- removed from StoreSettings and Conversation. Leaving the triggers in place
-- prevents every update of the master automation switch.
DROP TRIGGER IF EXISTS catalog_generation_conversation_control ON "Conversation";
DROP TRIGGER IF EXISTS catalog_generation_global_control ON "StoreSettings";
DROP FUNCTION IF EXISTS catalog_generation_conversation_control();
DROP FUNCTION IF EXISTS catalog_generation_global_control();
