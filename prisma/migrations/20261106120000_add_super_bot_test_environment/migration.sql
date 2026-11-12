-- This deliberately controls only the internal admin simulator. Provider
-- adapters continue to rely exclusively on botMasterSwitch.
ALTER TABLE "StoreSettings"
ADD COLUMN "botTestEnvironmentEnabled" BOOLEAN NOT NULL DEFAULT false;
