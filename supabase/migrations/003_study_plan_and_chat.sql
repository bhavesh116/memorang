-- ============================================================
-- Memorang — Study Plan + Chat Persistence
-- ============================================================

ALTER TABLE public.learnings
  ADD COLUMN IF NOT EXISTS plan_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (plan_status IN (
      'not_started',
      'generating',
      'ready_for_review',
      'approved',
      'failed'
    )),
  ADD COLUMN IF NOT EXISTS plan_error TEXT,
  ADD COLUMN IF NOT EXISTS active_plan_id UUID;

CREATE TABLE IF NOT EXISTS public.learning_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_id UUID NOT NULL REFERENCES public.learnings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'ready_for_review'
    CHECK (status IN ('draft', 'ready_for_review', 'approved', 'archived')),
  title TEXT NOT NULL,
  summary TEXT,
  difficulty TEXT,
  rationale TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.learning_plan_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_plan_id UUID NOT NULL REFERENCES public.learning_plans(id) ON DELETE CASCADE,
  learning_id UUID NOT NULL REFERENCES public.learnings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  rationale TEXT,
  order_index INTEGER NOT NULL,
  included BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.learning_plan_subtopics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_plan_id UUID NOT NULL REFERENCES public.learning_plans(id) ON DELETE CASCADE,
  learning_plan_topic_id UUID NOT NULL REFERENCES public.learning_plan_topics(id) ON DELETE CASCADE,
  learning_id UUID NOT NULL REFERENCES public.learnings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  rationale TEXT,
  order_index INTEGER NOT NULL,
  included BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.learning_chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_id UUID NOT NULL REFERENCES public.learnings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  langgraph_thread_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.learning_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_chat_thread_id UUID NOT NULL REFERENCES public.learning_chat_threads(id) ON DELETE CASCADE,
  learning_id UUID NOT NULL REFERENCES public.learnings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_plans_learning
  ON public.learning_plans (learning_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_learning_plan_topics_plan
  ON public.learning_plan_topics (learning_plan_id, order_index);

CREATE INDEX IF NOT EXISTS idx_learning_plan_subtopics_topic
  ON public.learning_plan_subtopics (learning_plan_topic_id, order_index);

CREATE INDEX IF NOT EXISTS idx_learning_chat_threads_learning
  ON public.learning_chat_threads (learning_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_learning_chat_messages_thread
  ON public.learning_chat_messages (learning_chat_thread_id, created_at ASC);

CREATE OR REPLACE FUNCTION public.match_learning_document_chunks(
  query_embedding vector(1536),
  target_learning_id UUID,
  match_count INTEGER DEFAULT 8
)
RETURNS TABLE (
  id UUID,
  page_number INTEGER,
  section_title TEXT,
  chunk_text TEXT,
  image_ids UUID[],
  similarity DOUBLE PRECISION
)
LANGUAGE sql
AS $$
  SELECT
    ldc.id,
    ldc.page_number,
    ldc.section_title,
    ldc.chunk_text,
    ldc.image_ids,
    1 - (ldc.embedding <=> query_embedding) AS similarity
  FROM public.learning_document_chunks ldc
  WHERE ldc.learning_id = target_learning_id
    AND ldc.embedding IS NOT NULL
  ORDER BY ldc.embedding <=> query_embedding
  LIMIT GREATEST(match_count, 1);
$$;

DROP TRIGGER IF EXISTS learning_plans_set_updated_at ON public.learning_plans;
CREATE TRIGGER learning_plans_set_updated_at
  BEFORE UPDATE ON public.learning_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS learning_plan_topics_set_updated_at ON public.learning_plan_topics;
CREATE TRIGGER learning_plan_topics_set_updated_at
  BEFORE UPDATE ON public.learning_plan_topics
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS learning_plan_subtopics_set_updated_at ON public.learning_plan_subtopics;
CREATE TRIGGER learning_plan_subtopics_set_updated_at
  BEFORE UPDATE ON public.learning_plan_subtopics
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS learning_chat_threads_set_updated_at ON public.learning_chat_threads;
CREATE TRIGGER learning_chat_threads_set_updated_at
  BEFORE UPDATE ON public.learning_chat_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
