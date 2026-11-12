-- The original automation migrations omitted the timestamp already required
-- by the Prisma model. Existing versions receive an initial timestamp.
ALTER TABLE "AutomationVersion"
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
