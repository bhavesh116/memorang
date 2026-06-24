-- ============================================================
-- Memorang — Lesson Analytics + Weightage
-- ============================================================

ALTER TABLE public.learning_lesson_questions
  ADD COLUMN IF NOT EXISTS weightage INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS hint_requests INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.learning_lesson_attempts
  ADD COLUMN IF NOT EXISTS response_time_ms INTEGER;
