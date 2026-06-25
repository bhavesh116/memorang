import {
  Clipboard,
  Hourglass,
  FileText,
  CheckCircle,
  GraduationCap,
  Trophy,
} from 'lucide-react';
import type { LearningStage } from '@/types/learning';

export const STAGE_ICONS: Record<LearningStage, React.ReactNode> = {
  empty: <Clipboard size={18} />,
  study_upload_pending: <Hourglass size={18} />,
  study_uploaded: <FileText size={18} />,
  user_approved_study: <CheckCircle size={18} />,
  lesson_in_progress: <GraduationCap size={18} />,
  lesson_complete: <Trophy size={18} />,
};

export const STAGE_TIMELINE_ICONS: Record<LearningStage, React.ReactNode> = {
  empty: <Clipboard size={16} />,
  study_upload_pending: <Hourglass size={16} />,
  study_uploaded: <FileText size={16} />,
  user_approved_study: <CheckCircle size={16} />,
  lesson_in_progress: <GraduationCap size={16} />,
  lesson_complete: <Trophy size={16} />,
};
