-- Messenger automatic polling must have an explicit per-channel activation
-- timestamp. Existing settings start unarmed, so a deployment cannot claim
-- old conversations until an administrator saves a Messenger default again.
ALTER TABLE "RockyAiSettings"
  ADD COLUMN "channelActivationSince" JSONB NOT NULL DEFAULT '{}';
