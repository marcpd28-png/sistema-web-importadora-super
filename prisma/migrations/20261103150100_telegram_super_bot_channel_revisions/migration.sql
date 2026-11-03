-- Channel mode changes must invalidate only that channel's pending Super Bot
-- work. Existing rows start at revision zero and remain valid until an
-- operator changes the corresponding channel configuration.
ALTER TABLE "RockyAiSettings" ADD COLUMN "channelRevisions" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "RockyAiDraft" ADD COLUMN "channelRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RockyAiCatalogJob" ADD COLUMN "channelRevision" INTEGER NOT NULL DEFAULT 0;
