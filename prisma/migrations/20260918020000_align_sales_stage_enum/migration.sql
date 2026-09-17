-- BC already uses this enum on the shared production database. Match its schema
-- while supporting fresh databases created from the web branch's older baseline.
DO $$ BEGIN
  CREATE TYPE "SalesConversationStage" AS ENUM (
    'AWAITING_PRODUCT_QUERY', 'AWAITING_BRAND_SELECTION', 'AWAITING_MODEL_SELECTION',
    'AWAITING_PURCHASE_CONFIRMATION', 'AWAITING_QUANTITY', 'AWAITING_PRICE_CONFIRMATION',
    'AWAITING_CUSTOMER_DATA', 'AWAITING_DOCUMENT_TYPE', 'AWAITING_DOCUMENT_DATA',
    'AWAITING_DELIVERY_METHOD', 'AWAITING_DELIVERY_DETAILS', 'AWAITING_ORDER_CONFIRMATION',
    'AWAITING_PAYMENT_METHOD', 'AWAITING_PAYMENT_CONFIRMATION', 'ORDER_CREATED', 'COMPLETED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
      AND table_name = 'ConversationSalesState' AND column_name = 'stage' AND udt_name <> 'SalesConversationStage') THEN
    ALTER TABLE "ConversationSalesState" ALTER COLUMN "stage" DROP DEFAULT;
    ALTER TABLE "ConversationSalesState" ALTER COLUMN "stage" TYPE "SalesConversationStage" USING "stage"::text::"SalesConversationStage";
    ALTER TABLE "ConversationSalesState" ALTER COLUMN "stage" SET DEFAULT 'AWAITING_PRODUCT_QUERY'::"SalesConversationStage";
  END IF;
END $$;
