-- ============================================================
-- Memorang — Ingestion Pipeline Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.learnings
  ADD COLUMN IF NOT EXISTS ingestion_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (ingestion_status IN (
      'not_started',
      'uploaded',
      'queued',
      'analyzing',
      'embedding',
      'completed',
      'failed'
    )),
  ADD COLUMN IF NOT EXISTS ingestion_progress_pct NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ingestion_eta_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS ingestion_error TEXT,
  ADD COLUMN IF NOT EXISTS ingestion_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ingestion_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS temporal_workflow_id TEXT,
  ADD COLUMN IF NOT EXISTS document_page_count INTEGER,
  ADD COLUMN IF NOT EXISTS document_image_count INTEGER;

CREATE TABLE IF NOT EXISTS public.learning_document_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_id UUID NOT NULL REFERENCES public.learnings(id) ON DELETE CASCADE,
  page_number INTEGER,
  figure_id TEXT,
  blob_name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  caption TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.learning_document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_id UUID NOT NULL REFERENCES public.learnings(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  page_number INTEGER,
  section_title TEXT,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),
  image_ids UUID[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT learning_document_chunks_unique_idx UNIQUE (learning_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS public.learning_ingestion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_id UUID NOT NULL REFERENCES public.learnings(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_document_images_learning_id
  ON public.learning_document_images (learning_id, page_number);

CREATE INDEX IF NOT EXISTS idx_learning_document_chunks_learning_id
  ON public.learning_document_chunks (learning_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_learning_document_chunks_page
  ON public.learning_document_chunks (learning_id, page_number);

CREATE INDEX IF NOT EXISTS idx_learning_ingestion_events_learning_id
  ON public.learning_ingestion_events (learning_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_learning_document_chunks_embedding'
  ) THEN
    EXECUTE '
      CREATE INDEX idx_learning_document_chunks_embedding
      ON public.learning_document_chunks
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    ';
  END IF;
END $$;
