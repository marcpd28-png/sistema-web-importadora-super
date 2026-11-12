-- Controls used by Super Bot to shape verified product recommendations in
-- connected messaging channels. The database remains the single source of
-- truth, so every channel observes the same limits and actions.
ALTER TABLE "StoreSettings"
  ADD COLUMN IF NOT EXISTS "botProductCardLimit" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "botMoreOptionsEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "botCatalogActionEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "StoreSettings"
  DROP CONSTRAINT IF EXISTS "StoreSettings_botProductCardLimit_range";

ALTER TABLE "StoreSettings"
  ADD CONSTRAINT "StoreSettings_botProductCardLimit_range"
  CHECK ("botProductCardLimit" BETWEEN 1 AND 5);
