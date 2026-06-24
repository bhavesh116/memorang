-- ============================================================
-- Memorang — Lessons + Quiz Loop
-- ============================================================

ALTER TABLE public.learning_chat_threads
  ADD COLUMN IF NOT EXISTS thread_type TEXT NOT NULL DEFAULT 'plan'
    CHECK (thread_type IN ('plan', 'lesson'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_chat_threads_unique_type
  ON public.learning_chat_threads (learning_id, user_id, thread_type);

CREATE TABLE IF NOT EXISTS public.learning_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_id UUID NOT NULL REFERENCES public.learnings(id) ON DELETE CASCADE,
  learning_plan_id UUID NOT NULL REFERENCES public.learning_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('draft', 'in_progress', 'completed', 'archived')),
  title TEXT NOT NULL,
  summary TEXT,
  total_questions INTEGER NOT NULL DEFAULT 0,
  current_question_index INTEGER NOT NULL DEFAULT 0,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.learning_lesson_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_lesson_id UUID NOT NULL REFERENCES public.learning_lessons(id) ON DELETE CASCADE,
  learning_id UUID NOT NULL REFERENCES public.learnings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  objective_title TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('text', 'image')),
  prompt TEXT NOT NULL,
  question_image_id UUID REFERENCES public.learning_document_images(id) ON DELETE SET NULL,
  question_image_url TEXT,
  choices JSONB NOT NULL,
  correct_choice_index INTEGER NOT NULL,
  hint_text TEXT NOT NULL,
  explanation_text TEXT NOT NULL,
  explanation_image_id UUID REFERENCES public.learning_document_images(id) ON DELETE SET NULL,
  explanation_image_url TEXT,
  order_index INTEGER NOT NULL,
  answered_correctly BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.learning_lesson_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_lesson_id UUID NOT NULL REFERENCES public.learning_lessons(id) ON DELETE CASCADE,
  learning_lesson_question_id UUID NOT NULL REFERENCES public.learning_lesson_questions(id) ON DELETE CASCADE,
  learning_id UUID NOT NULL REFERENCES public.learnings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  selected_choice_index INTEGER NOT NULL,
  is_correct BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_lessons_learning
  ON public.learning_lessons (learning_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_learning_lesson_questions_lesson
  ON public.learning_lesson_questions (learning_lesson_id, order_index);

CREATE INDEX IF NOT EXISTS idx_learning_lesson_attempts_question
  ON public.learning_lesson_attempts (learning_lesson_question_id, created_at DESC);

DROP TRIGGER IF EXISTS learning_lessons_set_updated_at ON public.learning_lessons;
CREATE TRIGGER learning_lessons_set_updated_at
  BEFORE UPDATE ON public.learning_lessons
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS learning_lesson_questions_set_updated_at ON public.learning_lesson_questions;
CREATE TRIGGER learning_lesson_questions_set_updated_at
  BEFORE UPDATE ON public.learning_lesson_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
