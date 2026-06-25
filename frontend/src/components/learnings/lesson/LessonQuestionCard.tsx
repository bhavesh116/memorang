import { Bot, Image as ImageIcon } from 'lucide-react';
import Button from '@/components/ui/Button';
import type { LearningLesson, LearningLessonQuestion } from '@/types/learning';

export interface LessonFeedback {
  correct: boolean;
  hint: string | null;
  explanation: string | null;
  explanationImageUrl: string | null;
  selectedChoiceIndex: number;
  completed: boolean;
}

interface Props {
  lesson: LearningLesson;
  currentQuestion: LearningLessonQuestion;
  selectedChoiceIndex: number | null;
  feedback: LessonFeedback | null;
  submitting: boolean;
  streaming: boolean;
  onChoiceSelect: (index: number) => void;
  onSubmit: () => void;
  onLearnMore: () => void;
  onNext: () => void;
}

function getChoiceClass(
  index: number,
  selectedChoiceIndex: number | null,
  feedback: LessonFeedback | null,
) {
  if (!feedback) {
    return selectedChoiceIndex === index
      ? 'lesson-choice lesson-choice-selected'
      : 'lesson-choice';
  }

  const isSelected = feedback.selectedChoiceIndex === index;
  if (feedback.correct) {
    return isSelected ? 'lesson-choice lesson-choice-correct' : 'lesson-choice';
  }

  return isSelected ? 'lesson-choice lesson-choice-incorrect' : 'lesson-choice';
}

export default function LessonQuestionCard({
  lesson,
  currentQuestion,
  selectedChoiceIndex,
  feedback,
  submitting,
  streaming,
  onChoiceSelect,
  onSubmit,
  onLearnMore,
  onNext,
}: Props) {
  return (
    <div className="lesson-question-card">
      <div className="lesson-question-header">
        <div>
          <div className="lesson-question-kicker">
            Objective: {currentQuestion.objective_title}
          </div>
          <h3>
            Question {lesson.current_question_index + 1} of {lesson.total_questions}
          </h3>
        </div>
        <div className="lesson-progress-group">
          <div className="lesson-progress-chip">{lesson.correct_answers} completed</div>
          <div className="lesson-weight-chip">Weight {currentQuestion.weightage}</div>
        </div>
      </div>

      {currentQuestion.question_image_url && (
        <div className="lesson-image-panel">
          <img
            src={currentQuestion.question_image_url}
            alt="Question visual"
            className="lesson-image"
          />
          <div className="lesson-image-caption">
            <ImageIcon size={14} /> Visual question reference
          </div>
        </div>
      )}

      <p className="lesson-question-prompt">{currentQuestion.prompt}</p>

      <div className="lesson-choices">
        {currentQuestion.choices.map((choice, index) => (
          <label key={index} className={getChoiceClass(index, selectedChoiceIndex, feedback)}>
            <input
              type="radio"
              name={`question-${currentQuestion.id}`}
              checked={selectedChoiceIndex === index}
              onChange={() => onChoiceSelect(index)}
              disabled={submitting || feedback?.correct === true}
            />
            <span>{choice}</span>
          </label>
        ))}
      </div>

      <div className="lesson-actions">
        <Button
          onClick={onSubmit}
          loading={submitting}
          disabled={selectedChoiceIndex === null || submitting || feedback?.correct === true}
        >
          Submit answer
        </Button>
        <Button variant="ghost" onClick={onLearnMore} disabled={streaming || submitting}>
          <Bot size={16} /> Learn more
        </Button>
      </div>

      {feedback && !feedback.correct && (
        <div className="lesson-feedback lesson-feedback-incorrect">
          <strong>Not quite.</strong> {feedback.hint}
        </div>
      )}

      {feedback?.correct && (
        <div className="lesson-feedback lesson-feedback-correct">
          <strong>Correct.</strong> {feedback.explanation}
          {feedback.explanationImageUrl && (
            <img
              src={feedback.explanationImageUrl}
              alt="Explanation visual"
              className="lesson-explanation-image"
            />
          )}
          <div className="lesson-next-row">
            <Button onClick={onNext}>
              {feedback.completed ? 'View results' : 'Next Quiz'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
