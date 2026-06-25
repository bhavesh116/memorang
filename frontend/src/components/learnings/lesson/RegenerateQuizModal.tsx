import { ChevronDown, Sparkles } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import PlanTopicTree, { countIncludedTopics } from '@/components/learnings/PlanTopicTree';
import type { LearningPlan } from '@/types/learning';

type StudyPlanDifficulty = 'Easy' | 'Intermediate' | 'Hard';

interface Props {
  plan: LearningPlan;
  selectedDifficulty: StudyPlanDifficulty;
  hasPendingDifficultyChange: boolean;
  regenerating: boolean;
  error: string | null;
  onClose: () => void;
  onDifficultyChange: (difficulty: StudyPlanDifficulty) => void;
  onTopicChange: (topicId: string, included: boolean) => void | Promise<void>;
  onSubtopicChange: (subtopicId: string, included: boolean) => void | Promise<void>;
  onConfirm: () => void;
}

export default function RegenerateQuizModal({
  plan,
  selectedDifficulty,
  hasPendingDifficultyChange,
  regenerating,
  error,
  onClose,
  onDifficultyChange,
  onTopicChange,
  onSubtopicChange,
  onConfirm,
}: Props) {
  const { includedTopicCount, includedSubtopicCount } = countIncludedTopics(plan.topics);

  return (
    <Modal
      title="Regenerate quiz"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={regenerating} disabled={regenerating} onClick={onConfirm}>
            <Sparkles size={16} />
            {hasPendingDifficultyChange ? 'Update plan' : 'Generate quiz'}
          </Button>
        </>
      }
    >
      <div className="lesson-regenerate-setup">
        <p className="lesson-regenerate-intro">
          Choose the difficulty and topics you want covered before generating a new quiz.
        </p>

        <label className="study-plan-empty-field">
          <span>Difficulty level</span>
          <div className="select-shell study-plan-difficulty-shell">
            <select
              className="input study-plan-difficulty-select"
              value={selectedDifficulty}
              onChange={(event) =>
                onDifficultyChange(event.target.value as StudyPlanDifficulty)
              }
              disabled={regenerating}
            >
              <option value="Easy">Easy</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Hard">Hard</option>
            </select>
            <span className="select-shell-icon" aria-hidden="true">
              <ChevronDown size={16} />
            </span>
          </div>
        </label>

        {hasPendingDifficultyChange ? (
          <p className="study-plan-difficulty-helper">
            Changing difficulty will regenerate the study plan first. Review the new topics
            before generating the quiz.
          </p>
        ) : null}

        <div className="study-plan-stats lesson-regenerate-stats">
          <div className="study-plan-stat">
            <span className="study-plan-stat-value">{includedTopicCount}</span>
            <span className="study-plan-stat-label">Topics selected</span>
          </div>
          <div className="study-plan-stat">
            <span className="study-plan-stat-value">{includedSubtopicCount}</span>
            <span className="study-plan-stat-label">Subtopics selected</span>
          </div>
        </div>

        <PlanTopicTree
          topics={plan.topics}
          onTopicChange={onTopicChange}
          onSubtopicChange={onSubtopicChange}
          disabled={regenerating}
          className="lesson-regenerate-topics"
        />

        {error ? <span className="study-chat-error">{error}</span> : null}
      </div>
    </Modal>
  );
}
