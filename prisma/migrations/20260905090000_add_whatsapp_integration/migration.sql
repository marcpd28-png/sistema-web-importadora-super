CREATE TYPE "WhatsappIntegrationStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR');

CREATE TABLE "WhatsappIntegration" (
    "id" TEXT NOT NULL,
    "businessId" VARCHAR(120) NOT NULL,
    "wabaId" VARCHAR(120) NOT NULL,
    "phoneNumberId" VARCHAR(120) NOT NULL,
    "displayPhoneNumber" VARCHAR(40),
    "verifiedName" VARCHAR(180),
    "accessTokenEncrypted" TEXT NOT NULL,
    "tokenType" VARCHAR(40) NOT NULL DEFAULT 'Bearer',
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" "WhatsappIntegrationStatus" NOT NULL DEFAULT 'ACTIVE',
    "connectedByUserId" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappIntegration_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WhatsappIntegration_businessId_idx" ON "WhatsappIntegration"("businessId");
CREATE INDEX "WhatsappIntegration_wabaId_idx" ON "WhatsappIntegration"("wabaId");
CREATE INDEX "WhatsappIntegration_phoneNumberId_idx" ON "WhatsappIntegration"("phoneNumberId");
CREATE INDEX "WhatsappIntegration_status_idx" ON "WhatsappIntegration"("status");
CREATE INDEX "WhatsappIntegration_connectedByUserId_idx" ON "WhatsappIntegration"("connectedByUserId");

ALTER TABLE "WhatsappIntegration"
ADD CONSTRAINT "WhatsappIntegration_connectedByUserId_fkey"
FOREIGN KEY ("connectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
