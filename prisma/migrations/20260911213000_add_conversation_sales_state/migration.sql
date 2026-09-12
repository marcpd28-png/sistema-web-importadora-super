-- CreateEnum
CREATE TYPE "SalesConversationStage" AS ENUM (
  'AWAITING_PRODUCT_QUERY',
  'AWAITING_BRAND_SELECTION',
  'AWAITING_MODEL_SELECTION',
  'AWAITING_PURCHASE_CONFIRMATION',
  'AWAITING_QUANTITY',
  'AWAITING_PRICE_CONFIRMATION',
  'AWAITING_CUSTOMER_DATA',
  'AWAITING_DOCUMENT_TYPE',
  'AWAITING_DOCUMENT_DATA',
  'AWAITING_DELIVERY_METHOD',
  'AWAITING_DELIVERY_DETAILS',
  'AWAITING_ORDER_CONFIRMATION',
  'AWAITING_PAYMENT_METHOD',
  'AWAITING_PAYMENT_CONFIRMATION',
  'ORDER_CREATED',
  'COMPLETED'
);

-- CreateTable
CREATE TABLE "ConversationSalesState" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,

  "stage" "SalesConversationStage"
    NOT NULL
    DEFAULT 'AWAITING_PRODUCT_QUERY',

  "category" VARCHAR(120),
  "brand" VARCHAR(120),

  "shownProducts" JSONB,

  "selectedProductCode" VARCHAR(64),

  "quantity" INTEGER,
  "unitPrice" DECIMAL(10,2),
  "priceTier" VARCHAR(40),
  "total" DECIMAL(12,2),

  "customerData" JSONB,
  "documentData" JSONB,
  "deliveryData" JSONB,
  "paymentData" JSONB,

  "orderNumber" VARCHAR(80),

  "createdAt" TIMESTAMP(3)
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  "updatedAt" TIMESTAMP(3)
    NOT NULL,

  CONSTRAINT "ConversationSalesState_pkey"
    PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX
  "ConversationSalesState_conversationId_key"
ON
  "ConversationSalesState"("conversationId");

-- CreateIndex
CREATE INDEX
  "ConversationSalesState_stage_idx"
ON
  "ConversationSalesState"("stage");

-- CreateIndex
CREATE INDEX
  "ConversationSalesState_selectedProductCode_idx"
ON
  "ConversationSalesState"("selectedProductCode");

-- CreateIndex
CREATE INDEX
  "ConversationSalesState_orderNumber_idx"
ON
  "ConversationSalesState"("orderNumber");

-- AddForeignKey
ALTER TABLE
  "ConversationSalesState"
ADD CONSTRAINT
  "ConversationSalesState_conversationId_fkey"
FOREIGN KEY
  ("conversationId")
REFERENCES
  "Conversation"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
