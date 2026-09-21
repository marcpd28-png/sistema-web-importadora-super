-- Apply separately after verifying pgvector is installed on the database host.
-- Additive only; no existing catalog or chat tables are altered.
BEGIN;
SET LOCAL lock_timeout = '3s';
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS knowledge_embeddings (
  "chunkId" TEXT PRIMARY KEY REFERENCES knowledge_chunks(id) ON DELETE CASCADE,
  embedding vector(1024) NOT NULL,
  model TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Exact vector scan is intentional for the initial corpus: no RAM-heavy ANN build on production.
COMMIT;
