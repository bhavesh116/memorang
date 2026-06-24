export type LearningStage =
  | 'empty'
  | 'study_upload_pending'
  | 'study_uploaded'
  | 'user_approved_study'
  | 'lesson_in_progress'
  | 'lesson_complete';

export type IngestionStatus =
  | 'not_started'
  | 'uploaded'
  | 'queued'
  | 'analyzing'
  | 'embedding'
  | 'completed'
  | 'failed';

export type PlanStatus =
  | 'not_started'
  | 'generating'
  | 'ready_for_review'
  | 'approved'
  | 'failed';

export interface LearningPlanSubtopic {
  id: string;
  title: string;
  description?: string | null;
  rationale?: string | null;
  order_index: number;
  included: boolean;
}

export interface LearningPlanTopic {
  id: string;
  title: string;
  description?: string | null;
  rationale?: string | null;
  order_index: number;
  included: boolean;
  subtopics: LearningPlanSubtopic[];
}

export interface LearningPlan {
  id: string;
  version: number;
  status: 'draft' | 'ready_for_review' | 'approved' | 'archived';
  title: string;
  summary?: string | null;
  difficulty?: 'Easy' | 'Intermediate' | 'Hard' | null;
  rationale?: string | null;
  approved_at?: string | null;
  topics: LearningPlanTopic[];
}

export interface LearningChatThread {
  id: string;
  langgraph_thread_id: string;
  status: 'active' | 'archived';
}

export interface LearningChatMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface StudyWorkspace {
  plan: LearningPlan | null;
  thread: LearningChatThread | null;
  messages: LearningChatMessage[];
}

export interface LearningLessonQuestion {
  id: string;
  objective_title: string;
  question_type: 'text' | 'image';
  prompt: string;
  question_image_url?: string | null;
  choices: string[];
  hint_text: string;
  explanation_text: string;
  explanation_image_url?: string | null;
  weightage: number;
  hint_requests: number;
  order_index: number;
  answered_correctly: boolean;
}

export interface LearningLesson {
  id: string;
  status: 'draft' | 'in_progress' | 'completed' | 'archived';
  title: string;
  summary?: string | null;
  total_questions: number;
  current_question_index: number;
  correct_answers: number;
  completed_at?: string | null;
}

export interface LessonObjectiveMetric {
  objective_title: string;
  mastery_score: number;
  correct_attempt_count: number;
  wrong_attempt_count: number;
  avg_response_time_ms: number;
  total_weightage: number;
}

export interface LessonSummary {
  mastery_index: number;
  weighted_score: number;
  readiness_score: number;
  velocity_metric: Array<{
    objective_title: string;
    avg_response_time_ms: number;
  }>;
  friction_zones: Array<{
    question_id: string;
    objective_title: string;
    order_index: number;
    hint_requests: number;
    page_refs: Array<number | string>;
  }>;
  objective_coverage: LessonObjectiveMetric[];
  attempt_multiplicity: Array<{
    objective_title: string;
    correct_attempt_count: number;
    wrong_attempt_count: number;
  }>;
  study_tips: string[];
}

export interface LessonWorkspace {
  plan: LearningPlan | null;
  lesson: LearningLesson | null;
  questions: LearningLessonQuestion[];
  thread: LearningChatThread | null;
  messages: LearningChatMessage[];
  summary: LessonSummary | null;
}

export interface Learning {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  stage: LearningStage;
  pdf_url?: string | null;
  pdf_blob_name?: string | null;
  ingestion_status: IngestionStatus;
  ingestion_progress_pct?: number | null;
  ingestion_eta_seconds?: number | null;
  ingestion_error?: string | null;
  ingestion_started_at?: string | null;
  ingestion_completed_at?: string | null;
  temporal_workflow_id?: string | null;
  document_page_count?: number | null;
  document_image_count?: number | null;
  plan_status: PlanStatus;
  plan_error?: string | null;
  active_plan_id?: string | null;
  created_at: string;
  updated_at: string;
}

export const STAGE_LABELS: Record<LearningStage, string> = {
  empty: 'Not Started',
  study_upload_pending: 'Uploading…',
  study_uploaded: 'PDF Ready',
  user_approved_study: 'Plan Approved',
  lesson_in_progress: 'Quiz',
  lesson_complete: 'Complete',
};

export const STAGE_COLORS: Record<LearningStage, string> = {
  empty: 'badge-gray',
  study_upload_pending: 'badge-amber',
  study_uploaded: 'badge-blue',
  user_approved_study: 'badge-purple',
  lesson_in_progress: 'badge-cyan',
  lesson_complete: 'badge-green',
};

export const INGESTION_LABELS: Record<IngestionStatus, string> = {
  not_started: 'Waiting for upload',
  uploaded: 'File uploaded',
  queued: 'Queued for analysis',
  analyzing: 'Analyzing document',
  embedding: 'Generating embeddings',
  completed: 'Analyzed',
  failed: 'Analysis failed',
};

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  not_started: 'Plan pending',
  generating: 'Generating study plan',
  ready_for_review: 'Ready for review',
  approved: 'Approved',
  failed: 'Plan failed',
};
