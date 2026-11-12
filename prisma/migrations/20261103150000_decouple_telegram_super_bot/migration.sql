-- Keep the master switch as a runtime gate for every existing channel, but do
-- not let its database trigger permanently disable Telegram's separately
-- gated Super Bot configuration. Telegram remains OFF until explicitly set.
DROP TRIGGER IF EXISTS rocky_ai_global_guard ON "StoreSettings";
DROP FUNCTION IF EXISTS rocky_ai_global_guard();
