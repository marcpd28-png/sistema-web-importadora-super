CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Product_name_trgm_idx"
  ON "Product" USING GIN (name gin_trgm_ops)
  WHERE "isVisible" = true;

CREATE INDEX IF NOT EXISTS "Product_code_trgm_idx"
  ON "Product" USING GIN (code gin_trgm_ops)
  WHERE "isVisible" = true;

CREATE INDEX IF NOT EXISTS "Product_externalCode_trgm_idx"
  ON "Product" USING GIN ("externalCode" gin_trgm_ops)
  WHERE "isVisible" = true AND "externalCode" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "Product_externalId_trgm_idx"
  ON "Product" USING GIN ("externalId" gin_trgm_ops)
  WHERE "isVisible" = true AND "externalId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "Product_brand_trgm_idx"
  ON "Product" USING GIN (brand gin_trgm_ops)
  WHERE "isVisible" = true AND brand IS NOT NULL;

CREATE INDEX IF NOT EXISTS "Product_category_trgm_idx"
  ON "Product" USING GIN (category gin_trgm_ops)
  WHERE "isVisible" = true AND category IS NOT NULL;

CREATE INDEX IF NOT EXISTS "Product_slug_trgm_idx"
  ON "Product" USING GIN (slug gin_trgm_ops)
  WHERE "isVisible" = true;
