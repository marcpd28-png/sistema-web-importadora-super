CREATE INDEX IF NOT EXISTS "Product_syncEnabled_lastSyncedAt_stockUnits_idx"
  ON "Product" ("syncEnabled", "lastSyncedAt" DESC, "stockUnits" DESC);

CREATE INDEX IF NOT EXISTS "Product_isVisible_stockUnits_lastSyncedAt_idx"
  ON "Product" ("isVisible", "stockUnits", "lastSyncedAt");
