-- A catalog generation can only prove that its document intent was persisted
-- in RockyOutboundJob. Actual provider delivery is tracked by its existing
-- YCloud receipt pipeline, so do not label this terminal generation state as
-- delivered.
UPDATE "CatalogGenerationJob"
SET "state" = 'enqueued', "updatedAt" = CURRENT_TIMESTAMP
WHERE "state" = 'delivered';

UPDATE "CatalogGenerationDelivery"
SET "state" = 'outbox_queued', "updatedAt" = CURRENT_TIMESTAMP
WHERE "state" = 'queued';
