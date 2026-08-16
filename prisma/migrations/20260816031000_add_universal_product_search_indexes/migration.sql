CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Product_description_trgm_idx"
  ON "Product" USING GIN (description gin_trgm_ops)
  WHERE "isVisible" = true AND description IS NOT NULL;

CREATE INDEX IF NOT EXISTS "Product_technicalSpecs_trgm_idx"
  ON "Product" USING GIN ("technicalSpecs" gin_trgm_ops)
  WHERE "isVisible" = true AND "technicalSpecs" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "Category_name_trgm_idx"
  ON "Category" USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Category_slug_trgm_idx"
  ON "Category" USING GIN (slug gin_trgm_ops);
