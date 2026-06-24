import { STAGE_COLORS, STAGE_LABELS, type LearningStage } from '@/types/learning';

interface BadgeProps {
  stage: LearningStage;
  showDot?: boolean;
}

export default function Badge({ stage, showDot = true }: BadgeProps) {
  return (
    <span className={`badge ${STAGE_COLORS[stage]}`}>
      {showDot && <span className="badge-dot" />}
      {STAGE_LABELS[stage]}
    </span>
  );
}
