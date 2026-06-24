export interface LearningPlanSubtopic {
  id: string;
  learning_plan_id: string;
  learning_plan_topic_id: string;
  learning_id: string;
  user_id: string;
  title: string;
  description?: string | null;
  rationale?: string | null;
  order_index: number;
  included: boolean;
  created_at: string;
  updated_at: string;
}

export interface LearningPlanTopic {
  id: string;
  learning_plan_id: string;
  learning_id: string;
  user_id: string;
  title: string;
  description?: string | null;
  rationale?: string | null;
  order_index: number;
  included: boolean;
  created_at: string;
  updated_at: string;
  subtopics?: LearningPlanSubtopic[];
}

export interface LearningPlan {
  id: string;
  learning_id: string;
  user_id: string;
  version: number;
  status: 'draft' | 'ready_for_review' | 'approved' | 'archived';
  title: string;
  summary?: string | null;
  difficulty?: string | null;
  rationale?: string | null;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
  topics?: LearningPlanTopic[];
}

export interface LearningChatThread {
  id: string;
  learning_id: string;
  user_id: string;
  langgraph_thread_id: string;
  thread_type: 'plan' | 'lesson';
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface LearningChatMessage {
  id: string;
  learning_chat_thread_id: string;
  learning_id: string;
  user_id: string;
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
