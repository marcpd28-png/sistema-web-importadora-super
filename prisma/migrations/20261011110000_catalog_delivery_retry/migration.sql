-- Rendering and delivery have separate retry budgets. A delivery failure must
-- preserve the immutable PDF result and durable part rows for idempotent retry.
ALTER TABLE "CatalogGenerationJob"
  ADD COLUMN "deliveryAttempts" INTEGER NOT NULL DEFAULT 0;
