-- Older deployments retained these PostgreSQL enums after the application
-- schema moved sales stages to a free-form string. A value such as STICKER or
-- a valid new sales stage then made Prisma reject the complete message list.

ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'STICKER';

ALTER TABLE "ConversationSalesState"
  ALTER COLUMN "stage" DROP DEFAULT;

ALTER TABLE "ConversationSalesState"
  ALTER COLUMN "stage" TYPE VARCHAR(50) USING "stage"::text;

ALTER TABLE "ConversationSalesState"
  ALTER COLUMN "stage" SET DEFAULT 'AWAITING_PRODUCT_QUERY';

DROP TYPE IF EXISTS "SalesConversationStage";
