import {
  LearningChatMessage,
  LearningChatThread,
  LearningPlan,
} from '../study-plan/types';

export interface LearningLessonQuestion {
  id: string;
  learning_lesson_id: string;
  learning_id: string;
  user_id: string;
  objective_title: string;
  question_type: 'text' | 'image';
  prompt: string;
  question_image_id?: string | null;
  question_image_url?: string | null;
  choices: string[];
  correct_choice_index: number;
  hint_text: string;
  explanation_text: string;
  explanation_image_id?: string | null;
  explanation_image_url?: string | null;
  weightage: number;
  hint_requests: number;
  order_index: number;
  answered_correctly: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface LearningLesson {
  id: string;
  learning_id: string;
  learning_plan_id: string;
  user_id: string;
  status: 'draft' | 'in_progress' | 'completed' | 'archived';
  title: string;
  summary?: string | null;
  total_questions: number;
  current_question_index: number;
  correct_answers: number;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LessonObjectiveMetric {
  objective_title: string;
  mastery_score: number;
  correct_attempt_count: number;
  wrong_attempt_count: number;
  avg_response_time_ms: number;
  total_weightage: number;
}

export interface LessonFrictionZone {
  question_id: string;
  objective_title: string;
  order_index: number;
  hint_requests: number;
  page_refs: Array<number | string>;
}

export interface LessonSummary {
  mastery_index: number;
  weighted_score: number;
  readiness_score: number;
  velocity_metric: Array<{
    objective_title: string;
    avg_response_time_ms: number;
  }>;
  friction_zones: LessonFrictionZone[];
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
