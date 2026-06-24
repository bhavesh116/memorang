-- ============================================================
-- Memorang — Initial Schema Migration
-- Run via: psql "postgresql://postgres:<PASSWORD>@db.yysfwststjwlmjugbvhj.supabase.co:5432/postgres" -f 001_initial.sql
-- ============================================================

-- Enable uuid-ossp extension (usually already available in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- LEARNINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.learnings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,

  -- Stage lifecycle for a learning item
  -- 'empty'                → Created, no PDF attached yet
  -- 'study_upload_pending' → PDF upload initiated on client
  -- 'study_uploaded'       → PDF stored in Azure Blob, url saved
  -- 'user_approved_study'  → User reviewed & approved AI lesson plan (HITL)
  -- 'lesson_in_progress'   → MCQ loop is active
  -- 'lesson_complete'      → All objectives done, summary available
  stage TEXT NOT NULL DEFAULT 'empty' CHECK (stage IN (
    'empty',
    'study_upload_pending',
    'study_uploaded',
    'user_approved_study',
    'lesson_in_progress',
    'lesson_complete'
  )),

  pdf_url       TEXT,          -- Signed Azure Blob SAS URL (readable)
  pdf_blob_name TEXT,          -- Raw blob path for deletion / re-signing

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.learnings ENABLE ROW LEVEL SECURITY;

-- SELECT: users see only their own rows
CREATE POLICY "learnings_select_own"
  ON public.learnings FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: users can only insert rows for themselves
CREATE POLICY "learnings_insert_own"
  ON public.learnings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: users can only update their own rows
CREATE POLICY "learnings_update_own"
  ON public.learnings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: users can only delete their own rows
CREATE POLICY "learnings_delete_own"
  ON public.learnings FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER learnings_set_updated_at
  BEFORE UPDATE ON public.learnings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_learnings_user_id
  ON public.learnings (user_id);

CREATE INDEX IF NOT EXISTS idx_learnings_created_at
  ON public.learnings (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_learnings_stage
  ON public.learnings (user_id, stage);
