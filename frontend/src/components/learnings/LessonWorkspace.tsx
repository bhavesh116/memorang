import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { CheckCircle2, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import Button from '@/components/ui/Button';
import { AppDispatch } from '@/store';
import { fetchLearningById } from '@/store/learningsSlice';
import { api } from '@/lib/api';
import { usePolling } from '@/hooks/usePolling';
import CoachChatDrawer from '@/components/learnings/lesson/CoachChatDrawer';
import LessonQuestionCard, {
  type LessonFeedback,
} from '@/components/learnings/lesson/LessonQuestionCard';
import LessonSummaryView from '@/components/learnings/lesson/LessonSummary';
import RegenerateQuizModal from '@/components/learnings/lesson/RegenerateQuizModal';
import { countIncludedTopics } from '@/components/learnings/PlanTopicTree';
import type {
  Learning,
  LearningChatMessage,
  LessonWorkspace as LessonWorkspaceType,
} from '@/types/learning';

interface Props {
  learning: Learning;
}

type StudyPlanDifficulty = 'Easy' | 'Intermediate' | 'Hard';

export default function LessonWorkspace({ learning }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const [workspace, setWorkspace] = useState<LessonWorkspaceType | null>(null);
  const [loading, setLoading] = useState(false);
  const [startingLesson, setStartingLesson] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [coachDrawerOpen, setCoachDrawerOpen] = useState(false);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [selectedChoiceIndex, setSelectedChoiceIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<LessonFeedback | null>(null);
  const [coachDraft, setCoachDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [regenerateSetupOpen, setRegenerateSetupOpen] = useState(false);
  const [selectedDifficulty, setSelectedDifficulty] =
    useState<StudyPlanDifficulty>('Intermediate');
  const [regeneratingPlan, setRegeneratingPlan] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const assistantDraftRef = useRef('');
  const questionStartedAtRef = useRef<number>(Date.now());
  const lessonStartRequestedRef = useRef<string | null>(null);

  const shouldShowLesson =
    learning.stage === 'user_approved_study' ||
    learning.stage === 'lesson_in_progress' ||
    learning.stage === 'lesson_complete';

  const lesson = workspace?.lesson ?? null;
  const questions = workspace?.questions ?? [];
  const messages = workspace?.messages ?? [];
  const regeneratePlan = workspace?.plan ?? null;

  const currentQuestion = useMemo(() => {
    if (!lesson) {
      return null;
    }

    if (activeQuestionId) {
      const activeQuestion = questions.find((question) => question.id === activeQuestionId);
      if (activeQuestion) {
        return activeQuestion;
      }
    }

    return (
      questions[lesson.current_question_index] ??
      questions.find((question) => !question.answered_correctly) ??
      null
    );
  }, [activeQuestionId, lesson, questions]);

  const isSummaryView =
    (learning.stage === 'lesson_complete' || lesson?.status === 'completed') &&
    !feedback?.correct;

  const { includedSubtopicCount } = useMemo(
    () => countIncludedTopics(regeneratePlan?.topics ?? []),
    [regeneratePlan],
  );

  const hasPendingDifficultyChange = regeneratePlan
    ? selectedDifficulty !== (regeneratePlan.difficulty ?? 'Intermediate')
    : false;

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { workspace: nextWorkspace } = await api.learnings.getLessonWorkspace(learning.id);
      setWorkspace(nextWorkspace);
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [learning.id]);

  useEffect(() => {
    if (!shouldShowLesson) {
      return;
    }
    void loadWorkspace();
  }, [learning.id, shouldShowLesson, learning.stage, learning.plan_status, loadWorkspace]);

  usePolling(
    () => loadWorkspace(),
    3000,
    shouldShowLesson && !lesson && !loading && !startingLesson,
  );

  useEffect(() => {
    if (
      learning.stage === 'user_approved_study' &&
      !lesson &&
      !loading &&
      !startingLesson &&
      lessonStartRequestedRef.current !== learning.id
    ) {
      lessonStartRequestedRef.current = learning.id;
      void startLesson(false);
    }
  }, [learning.id, learning.stage, lesson, loading, startingLesson]);

  useEffect(() => {
    setSelectedChoiceIndex(null);
    setFeedback(null);
    questionStartedAtRef.current = Date.now();
  }, [currentQuestion?.id]);

  useEffect(() => {
    if (!lesson || questions.length === 0) {
      setActiveQuestionId(null);
      return;
    }

    if (feedback?.correct) {
      return;
    }

    const nextQuestion =
      questions[lesson.current_question_index] ??
      questions.find((question) => !question.answered_correctly) ??
      null;

    setActiveQuestionId(nextQuestion?.id ?? null);
  }, [feedback?.correct, lesson, questions]);

  async function startLesson(regenerate = false) {
    setLoading(true);
    setStartingLesson(true);
    setError(null);
    try {
      const { workspace: nextWorkspace } = await api.learnings.startLesson(
        learning.id,
        regenerate,
      );
      setWorkspace(nextWorkspace);
      setFeedback(null);
      setSelectedChoiceIndex(null);
      setActiveQuestionId(null);
      await dispatch(fetchLearningById(learning.id));
    } catch (nextError) {
      setError((nextError as Error).message);
      lessonStartRequestedRef.current = null;
    } finally {
      setLoading(false);
      setStartingLesson(false);
    }
  }

  function openRegenerateSetup() {
    setSelectedDifficulty(workspace?.plan?.difficulty ?? 'Intermediate');
    setRegenerateError(null);
    setRegenerateSetupOpen(true);
  }

  function closeRegenerateSetup() {
    setRegenerateSetupOpen(false);
    setRegenerateError(null);
    setRegeneratingPlan(false);
  }

  async function updateRegenerateTopic(topicId: string, included: boolean) {
    const { plan: updatedPlan } = await api.learnings.updateTopicSelection(
      learning.id,
      topicId,
      included,
    );
    setWorkspace((current) =>
      current ? { ...current, plan: updatedPlan } : current,
    );
  }

  async function updateRegenerateSubtopic(subtopicId: string, included: boolean) {
    const { plan: updatedPlan } = await api.learnings.updateSubtopicSelection(
      learning.id,
      subtopicId,
      included,
    );
    setWorkspace((current) =>
      current ? { ...current, plan: updatedPlan } : current,
    );
  }

  async function confirmRegenerateQuiz() {
    const plan = workspace?.plan;
    if (!plan) {
      setRegenerateError('Study plan not found.');
      return;
    }

    if (includedSubtopicCount === 0) {
      setRegenerateError('Select at least one subtopic to include in the quiz.');
      return;
    }

    setRegenerateError(null);
    setRegeneratingPlan(true);
    try {
      if (hasPendingDifficultyChange) {
        const { plan: generatedPlan } = await api.learnings.regeneratePlan(
          learning.id,
          selectedDifficulty,
        );
        setWorkspace((current) =>
          current ? { ...current, plan: generatedPlan } : current,
        );
        await dispatch(fetchLearningById(learning.id));
        setRegenerateError(
          'Study plan updated for the new difficulty. Review your topic selections, then click Generate quiz again.',
        );
        return;
      }

      if (learning.plan_status !== 'approved') {
        const { plan: approvedPlan } = await api.learnings.approvePlan(learning.id);
        setWorkspace((current) =>
          current ? { ...current, plan: approvedPlan } : current,
        );
        await dispatch(fetchLearningById(learning.id));
      }

      closeRegenerateSetup();
      await startLesson(true);
    } catch (nextError) {
      setRegenerateError((nextError as Error).message);
    } finally {
      setRegeneratingPlan(false);
    }
  }

  async function submitAnswer() {
    if (!lesson || !currentQuestion || selectedChoiceIndex === null) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await api.learnings.answerLessonQuestion(
        learning.id,
        lesson.id,
        currentQuestion.id,
        selectedChoiceIndex,
        Math.max(Date.now() - questionStartedAtRef.current, 0),
      );
      setFeedback({
        correct: result.correct,
        hint: result.hint,
        explanation: result.explanation,
        explanationImageUrl: result.explanationImageUrl,
        selectedChoiceIndex: result.selectedChoiceIndex,
        completed: result.completed,
      });
      setWorkspace(result.lesson);
      await dispatch(fetchLearningById(learning.id));
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function goToNextQuestion() {
    const nextQuestion = lesson
      ? questions[lesson.current_question_index] ??
        questions.find((question) => !question.answered_correctly) ??
        null
      : null;

    setActiveQuestionId(nextQuestion?.id ?? null);
    setSelectedChoiceIndex(null);
    setFeedback(null);
  }

  async function sendCoachMessage(text: string) {
    if (!text.trim() || streaming) {
      return;
    }

    const message = text.trim();
    setCoachDraft('');
    setStreaming(true);
    setError(null);
    assistantDraftRef.current = '';

    setWorkspace((current) =>
      current
        ? {
            ...current,
            messages: [
              ...current.messages,
              {
                id: `user-pending-${Date.now()}`,
                role: 'user',
                content: message,
                created_at: new Date().toISOString(),
              } as LearningChatMessage,
              {
                id: `assistant-draft-${Date.now()}`,
                role: 'assistant',
                content: '',
                created_at: new Date().toISOString(),
              } as LearningChatMessage,
            ],
          }
        : current,
    );

    try {
      await api.learnings.streamLessonChat(learning.id, message, {
        onAck: ({ userMessage }) => {
          setWorkspace((current) =>
            current
              ? {
                  ...current,
                  messages: [
                    ...current.messages.filter(
                      (item) =>
                        !String(item.id).startsWith('assistant-draft-') &&
                        !String(item.id).startsWith('user-pending-'),
                    ),
                    userMessage,
                    {
                      id: `assistant-draft-${Date.now()}`,
                      role: 'assistant',
                      content: '',
                      created_at: new Date().toISOString(),
                    } as LearningChatMessage,
                  ],
                }
              : current,
          );
        },
        onToken: (tokenText) => {
          assistantDraftRef.current += tokenText;
          setWorkspace((current) =>
            current
              ? {
                  ...current,
                  messages: current.messages.map((item, index, list) =>
                    index === list.length - 1 && item.role === 'assistant'
                      ? { ...item, content: assistantDraftRef.current }
                      : item,
                  ),
                }
              : current,
          );
        },
        onMessage: ({ message: assistantMessage }) => {
          setWorkspace((current) =>
            current
              ? {
                  ...current,
                  messages: [
                    ...current.messages.filter(
                      (item) => !String(item.id).startsWith('assistant-draft-'),
                    ),
                    assistantMessage,
                  ],
                }
              : current,
          );
        },
        onError: (messageText) => {
          setError(messageText);
        },
      });
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      setStreaming(false);
    }
  }

  function handleCoachComposerKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void sendCoachMessage(coachDraft);
  }

  function askToLearnMore() {
    window.scrollTo(0, 0);
    window.requestAnimationFrame(() => {
      setCoachDrawerOpen(true);
    });
    setError(null);
  }

  if (!shouldShowLesson) {
    return null;
  }

  return (
    <>
      <CoachChatDrawer
        open={!isSummaryView && coachDrawerOpen}
        messages={messages}
        draft={coachDraft}
        error={error}
        streaming={streaming}
        onClose={() => setCoachDrawerOpen(false)}
        onDraftChange={setCoachDraft}
        onSend={() => void sendCoachMessage(coachDraft)}
        onKeyDown={handleCoachComposerKeyDown}
      />

      {regenerateSetupOpen && regeneratePlan ? (
        <RegenerateQuizModal
          plan={regeneratePlan}
          selectedDifficulty={selectedDifficulty}
          hasPendingDifficultyChange={hasPendingDifficultyChange}
          regenerating={regeneratingPlan || startingLesson}
          error={regenerateError}
          onClose={closeRegenerateSetup}
          onDifficultyChange={setSelectedDifficulty}
          onTopicChange={updateRegenerateTopic}
          onSubtopicChange={updateRegenerateSubtopic}
          onConfirm={() => void confirmRegenerateQuiz()}
        />
      ) : null}

      <div className="detail-section">
        <div className="detail-section-title">
          <span><Sparkles size={20} /></span>{' '}
          {isSummaryView ? 'Lesson Summary' : 'Lesson Quiz'}
        </div>

        {loading && !workspace ? (
          <div className="study-plan-empty-state">
            <Loader2 size={18} className="animate-spin" />
            <span>Loading lesson workspace…</span>
          </div>
        ) : !lesson ? (
          <div className="lesson-generating-state">
            <div className="lesson-generating-header">
              <div className="lesson-generating-badge">
                <Sparkles size={16} /> Preparing quiz
              </div>
              <div className="lesson-generating-copy">
                Generating weighted quiz questions from your approved study plan.
              </div>
            </div>
            <div className="lesson-generating-preview">
              <div className="lesson-generating-card shimmer" />
              <div className="lesson-generating-card shimmer" />
              <div className="lesson-generating-card shimmer" />
            </div>
          </div>
        ) : (
          <div className={isSummaryView ? 'lesson-summary-layout' : 'lesson-layout'}>
            <div className="lesson-main">
              <div className="lesson-header-card">
                <div>
                  <div className="study-plan-summary-topline">
                    <span>{lesson.status === 'completed' ? 'Lesson complete' : 'Lesson in progress'}</span>
                    <span>
                      {lesson.correct_answers}/{lesson.total_questions} correct
                    </span>
                  </div>
                  <h3>{lesson.title}</h3>
                  {lesson.summary && <p>{lesson.summary}</p>}
                </div>
                <div className="study-plan-actions study-plan-actions-top">
                  <Button
                    variant="ghost"
                    loading={loading || startingLesson}
                    disabled={
                      loading ||
                      startingLesson ||
                      streaming ||
                      submitting ||
                      regenerateSetupOpen
                    }
                    onClick={openRegenerateSetup}
                  >
                    <RefreshCw size={16} /> Regenerate quiz
                  </Button>
                </div>
              </div>

              {isSummaryView ? (
                <div className="lesson-complete-card">
                  <CheckCircle2 size={22} />
                  <div>
                    <h4>Your lesson summary is ready.</h4>
                    <p>
                      Review your performance insights below or regenerate the quiz with
                      updated topic and difficulty selections.
                    </p>
                  </div>
                </div>
              ) : null}

              {isSummaryView && workspace?.summary ? (
                <LessonSummaryView summary={workspace.summary} />
              ) : null}

              {!isSummaryView && currentQuestion ? (
                <LessonQuestionCard
                  lesson={lesson}
                  currentQuestion={currentQuestion}
                  selectedChoiceIndex={selectedChoiceIndex}
                  feedback={feedback}
                  submitting={submitting}
                  streaming={streaming}
                  onChoiceSelect={setSelectedChoiceIndex}
                  onSubmit={() => void submitAnswer()}
                  onLearnMore={askToLearnMore}
                  onNext={goToNextQuestion}
                />
              ) : (
                !isSummaryView ? (
                  <div className="study-plan-empty-state">
                    <span>No active question found.</span>
                  </div>
                ) : null
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
