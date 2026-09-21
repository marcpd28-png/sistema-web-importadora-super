ALTER TABLE "Order" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Order" SET "isTest" = true WHERE "adminNotes" LIKE '%PRUEBA BC AUTORIZADA - NO COBRAR NI DESPACHAR%';
CREATE TABLE "OrderReview" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" VARCHAR(30) NOT NULL,
  "previousStatus" "OrderStatus" NOT NULL,
  "nextStatus" "OrderStatus" NOT NULL,
  "note" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderReview_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "OrderReview_orderId_createdAt_idx" ON "OrderReview"("orderId", "createdAt");
