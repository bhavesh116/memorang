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

export const VALID_STAGES: LearningStage[] = [
  'empty',
  'study_upload_pending',
  'study_uploaded',
  'user_approved_study',
  'lesson_in_progress',
  'lesson_complete',
];

export const VALID_INGESTION_STATUSES: IngestionStatus[] = [
  'not_started',
  'uploaded',
  'queued',
  'analyzing',
  'embedding',
  'completed',
  'failed',
];

export const VALID_PLAN_STATUSES: PlanStatus[] = [
  'not_started',
  'generating',
  'ready_for_review',
  'approved',
  'failed',
];

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

export interface LearningIngestionStatus {
  learning: Learning;
}

export interface AuthUser {
  id: string;
  email?: string;
}
