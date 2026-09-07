-- AlterEnum

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "commissionAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "promoCodeId" TEXT,
ADD COLUMN "promoCodeStr" VARCHAR(40),
ADD COLUMN "deliveryType" VARCHAR(30);

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN "deliveryType" VARCHAR(30);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "discountType" VARCHAR(20) NOT NULL DEFAULT 'PERCENTAGE',
    "discountValue" DECIMAL(10,2) NOT NULL,
    "minOrderAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "commissionType" VARCHAR(20) NOT NULL DEFAULT 'FIXED',
    "commissionValue" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "creatorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX "PromoCode_code_idx" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX "PromoCode_creatorId_idx" ON "PromoCode"("creatorId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
