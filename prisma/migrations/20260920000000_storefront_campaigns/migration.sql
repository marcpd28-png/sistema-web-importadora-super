CREATE TABLE "StorefrontCampaign" (
  "slug" VARCHAR(40) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "description" TEXT NOT NULL DEFAULT '',
  "productCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StorefrontCampaign_pkey" PRIMARY KEY ("slug")
);
INSERT INTO "StorefrontCampaign" ("slug") VALUES ('ofertas'), ('preventa');
