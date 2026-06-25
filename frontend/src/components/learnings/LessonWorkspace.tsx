import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { createPortal } from 'react-dom';
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Info,
  Loader2,
  RefreshCw,
  SendHorizonal,
  Sparkles,
  X,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { AppDispatch } from '@/store';
import { fetchLearningById } from '@/store/learningsSlice';
import { api } from '@/lib/api';
import type {
  Learning,
  LearningChatMessage,
  LessonObjectiveMetric,
  LessonSummary,
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
  const [chartHoveredObjectiveTitle, setChartHoveredObjectiveTitle] =
    useState<string | null>(null);
  const [detailObjectiveTitle, setDetailObjectiveTitle] = useState<string | null>(null);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [selectedChoiceIndex, setSelectedChoiceIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    hint: string | null;
    explanation: string | null;
    explanationImageUrl: string | null;
    selectedChoiceIndex: number;
    completed: boolean;
  } | null>(null);
  const [coachDraft, setCoachDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [regenerateSetupOpen, setRegenerateSetupOpen] = useState(false);
  const [selectedDifficulty, setSelectedDifficulty] =
    useState<StudyPlanDifficulty>('Intermediate');
  const [regeneratingPlan, setRegeneratingPlan] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [openRegenerateTopics, setOpenRegenerateTopics] = useState<
    Record<string, boolean>
  >({});
  const assistantDraftRef = useRef('');
  const questionStartedAtRef = useRef<number>(Date.now());
  const lessonStartRequestedRef = useRef<string | null>(null);

  const shouldShowLesson =
    learning.stage === 'user_approved_study' ||
    learning.stage === 'lesson_in_progress' ||
    learning.stage === 'lesson_complete';

  const lesson = workspace?.lesson ?? null;

  useEffect(() => {
    if (!shouldShowLesson) {
      return;
    }

    void loadWorkspace();
  }, [learning.id, shouldShowLesson, learning.stage, learning.plan_status]);

  useEffect(() => {
    if (!shouldShowLesson || lesson || loading || startingLesson) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      void loadWorkspace();
    }, 3000);

    return () => window.clearInterval(interval);
  }, [shouldShowLesson, lesson, loading, startingLesson, learning.id]);

  const questions = workspace?.questions ?? [];
  const messages = workspace?.messages ?? [];
  const currentQuestion = useMemo(
    () => {
      if (!lesson) {
        return null;
      }

      if (activeQuestionId) {
        const activeQuestion = questions.find(
          (question) => question.id === activeQuestionId,
        );
        if (activeQuestion) {
          return activeQuestion;
        }
      }

      return (
        questions[lesson.current_question_index] ??
        questions.find((question) => !question.answered_correctly) ??
        null
      );
    },
    [activeQuestionId, lesson, questions],
  );
  const isSummaryView =
    (learning.stage === 'lesson_complete' || lesson?.status === 'completed') &&
    !feedback?.correct;
  const regeneratePlan = workspace?.plan ?? null;
  const includedRegenerateTopicCount = useMemo(
    () => (regeneratePlan?.topics ?? []).filter((topic) => topic.included).length,
    [regeneratePlan],
  );
  const includedRegenerateSubtopicCount = useMemo(
    () =>
      (regeneratePlan?.topics ?? []).reduce(
        (count, topic) =>
          count + topic.subtopics.filter((subtopic) => subtopic.included).length,
        0,
      ),
    [regeneratePlan],
  );
  const hasPendingDifficultyChange = regeneratePlan
    ? selectedDifficulty !== (regeneratePlan.difficulty ?? 'Intermediate')
    : false;

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

  useEffect(() => {
    if (!coachDrawerOpen) {
      return;
    }

    const scrollY = window.scrollY;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalBodyOverflow = document.body.style.overflow;
    const originalBodyPosition = document.body.style.position;
    const originalBodyTop = document.body.style.top;
    const originalBodyLeft = document.body.style.left;
    const originalBodyRight = document.body.style.right;
    const originalBodyWidth = document.body.style.width;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';

    return () => {
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.overflow = originalBodyOverflow;
      document.body.style.position = originalBodyPosition;
      document.body.style.top = originalBodyTop;
      document.body.style.left = originalBodyLeft;
      document.body.style.right = originalBodyRight;
      document.body.style.width = originalBodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, [coachDrawerOpen]);

  async function loadWorkspace() {
    setLoading(true);
    setError(null);
    try {
      const { workspace: nextWorkspace } = await api.learnings.getLessonWorkspace(
        learning.id,
      );
      setWorkspace(nextWorkspace);
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      setLoading(false);
    }
  }

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
    const planDifficulty = workspace?.plan?.difficulty ?? 'Intermediate';
    setSelectedDifficulty(planDifficulty);
    setRegenerateError(null);
    setOpenRegenerateTopics({});
    setRegenerateSetupOpen(true);
  }

  function closeRegenerateSetup() {
    setRegenerateSetupOpen(false);
    setRegenerateError(null);
    setRegeneratingPlan(false);
  }

  function toggleRegenerateTopic(topicId: string) {
    setOpenRegenerateTopics((current) => ({
      ...current,
      [topicId]: !current[topicId],
    }));
  }

  async function updateRegenerateTopic(topicId: string, included: boolean) {
    const { plan: updatedPlan } = await api.learnings.updateTopicSelection(
      learning.id,
      topicId,
      included,
    );
    setWorkspace((current) =>
      current
        ? {
            ...current,
            plan: updatedPlan,
          }
        : current,
    );
  }

  async function updateRegenerateSubtopic(subtopicId: string, included: boolean) {
    const { plan: updatedPlan } = await api.learnings.updateSubtopicSelection(
      learning.id,
      subtopicId,
      included,
    );
    setWorkspace((current) =>
      current
        ? {
            ...current,
            plan: updatedPlan,
          }
        : current,
    );
  }

  async function confirmRegenerateQuiz() {
    const plan = workspace?.plan;
    if (!plan) {
      setRegenerateError('Study plan not found.');
      return;
    }

    if (includedRegenerateSubtopicCount === 0) {
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
          current
            ? {
                ...current,
                plan: generatedPlan,
              }
            : current,
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
          current
            ? {
                ...current,
                plan: approvedPlan,
              }
            : current,
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
                      (item) => !String(item.id).startsWith('user-pending-'),
                    ),
                    userMessage,
                    {
                      id: `lesson-assistant-draft-${Date.now()}`,
                      role: 'assistant',
                      content: '',
                      created_at: new Date().toISOString(),
                    } as LearningChatMessage,
                  ],
                }
              : current,
          );
        },
        onToken: (token) => {
          assistantDraftRef.current += token;
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
                      (item) =>
                        !String(item.id).startsWith('lesson-assistant-draft-'),
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

  function getChoiceClass(index: number) {
    if (!feedback) {
      return selectedChoiceIndex === index
        ? 'lesson-choice lesson-choice-selected'
        : 'lesson-choice';
    }

    const isSelected = feedback.selectedChoiceIndex === index;
    if (feedback.correct) {
      return isSelected
        ? 'lesson-choice lesson-choice-correct'
        : 'lesson-choice';
    }

    return isSelected
      ? 'lesson-choice lesson-choice-incorrect'
      : 'lesson-choice';
  }

  function formatDuration(ms: number) {
    if (!ms || ms <= 0) return '0s';
    const totalSeconds = Math.round(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  }

  function renderMetricInfo(description: string, label: string) {
    return (
      <button
        type="button"
        className="lesson-metric-info"
        aria-label={`${label}: ${description}`}
      >
        <Info size={14} />
        <span className="lesson-metric-tooltip" role="tooltip">
          {description}
        </span>
      </button>
    );
  }

  function renderSummary() {
    if (!workspace?.summary) return null;
    const summary: LessonSummary = workspace.summary;
    const maxObjectiveScore = Math.max(
      ...summary.objective_coverage.map((item) => item.mastery_score),
      100,
    );
    return (
      <div className="lesson-summary-stack">
        <div className="lesson-summary-grid">
          <div className="lesson-summary-card">
            <div className="lesson-summary-value">{summary.mastery_index}%</div>
            <div className="lesson-summary-label lesson-summary-label-with-info">
              <span>Mastery Index</span>
              {renderMetricInfo(
                'The share of objectives you cleared without any wrong attempts.',
                'Mastery Index',
              )}
            </div>
          </div>
          <div className="lesson-summary-card">
            <div className="lesson-summary-value">{summary.weighted_score}%</div>
            <div className="lesson-summary-label lesson-summary-label-with-info">
              <span>Weighted Score</span>
              {renderMetricInfo(
                'A weighted performance score that penalizes wrong attempts and hint usage more heavily on higher-weight questions.',
                'Weighted Score',
              )}
            </div>
          </div>
          <div className="lesson-summary-card">
            <div className="lesson-summary-value">{summary.readiness_score}%</div>
            <div className="lesson-summary-label lesson-summary-label-with-info">
              <span>Readiness Score</span>
              {renderMetricInfo(
                'An overall readiness estimate combining weighted score, mastery index, and friction zones.',
                'Readiness Score',
              )}
            </div>
          </div>
        </div>

        <div className="lesson-chart-grid">
          <div className="lesson-chart-card">
            <h4>Objective Coverage</h4>
            {renderRadarChart(summary.objective_coverage, maxObjectiveScore)}
          </div>

          <div className="lesson-chart-card">
            <h4>Attempt Multiplicity</h4>
            <div className="lesson-stacked-list">
              {summary.attempt_multiplicity.map((metric) => {
                const totalAttempts =
                  metric.correct_attempt_count + metric.wrong_attempt_count;
                const correctWidth =
                  totalAttempts > 0
                    ? (metric.correct_attempt_count / totalAttempts) * 100
                    : 0;
                const wrongWidth =
                  totalAttempts > 0
                    ? (metric.wrong_attempt_count / totalAttempts) * 100
                    : 0;

                return (
                  <div key={metric.objective_title} className="lesson-stacked-row">
                    <div className="lesson-stacked-label">{metric.objective_title}</div>
                    <div className="lesson-stacked-bar">
                      <div
                        className="lesson-stacked-fill lesson-stacked-first"
                        style={{ width: `${correctWidth}%` }}
                      />
                      <div
                        className="lesson-stacked-fill lesson-stacked-assisted"
                        style={{ width: `${wrongWidth}%` }}
                      />
                    </div>
                    <div className="lesson-stacked-meta">
                      {metric.correct_attempt_count} correct / {metric.wrong_attempt_count} wrong
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="lesson-chart-grid">
          <div className="lesson-chart-card">
            <h4>Velocity Metric</h4>
            <div className="lesson-metric-list">
              {summary.velocity_metric.map((metric) => (
                <div key={metric.objective_title} className="lesson-metric-row">
                  <span>{metric.objective_title}</span>
                  <strong>{formatDuration(metric.avg_response_time_ms)}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="lesson-chart-card">
            <h4 className="lesson-chart-heading-with-info">
              <span>Friction Zones</span>
              {renderMetricInfo(
                'Questions you answered incorrectly multiple times, indicating areas that need more review.',
                'Friction Zones',
              )}
            </h4>
            {summary.friction_zones.length === 0 ? (
              <p className="lesson-summary-empty">
                No friction zones were detected in this run.
              </p>
            ) : (
              <div className="lesson-metric-list">
                {summary.friction_zones.map((zone) => (
                  <div key={zone.question_id} className="lesson-friction-row">
                    <div>
                      <strong>{zone.objective_title}</strong>
                      <div className="lesson-friction-subtext">
                        Question {zone.order_index + 1}
                        {zone.page_refs.length ? ` • Pages ${zone.page_refs.join(', ')}` : ''}
                      </div>
                    </div>
                    <span>{zone.wrong_attempt_count} wrong</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lesson-chart-card">
          <h4>Study Tips</h4>
          <ul className="lesson-study-tips">
            {summary.study_tips.map((tip, index) => (
              <li key={index}>{tip}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  function renderRadarChart(
    objectiveCoverage: LessonObjectiveMetric[],
    maxObjectiveScore: number,
  ) {
    const size = 260;
    const center = size / 2;
    const radius = 88;
    const levels = [25, 50, 75, 100];
    const radarPoints = objectiveCoverage.map(
      (objective: LessonObjectiveMetric, index: number) => {
        const angle =
          (Math.PI * 2 * index) / objectiveCoverage.length - Math.PI / 2;
        const scaledRadius = radius * (objective.mastery_score / maxObjectiveScore);
        const x = center + Math.cos(angle) * scaledRadius;
        const y = center + Math.sin(angle) * scaledRadius;
        return {
          objective,
          x,
          y,
        };
      },
    );
    const points = radarPoints.map((point) => `${point.x},${point.y}`);
    const hoveredRadarPoint =
      radarPoints.find(
        (point) => point.objective.objective_title === chartHoveredObjectiveTitle,
      ) ?? null;

    return (
      <div className="lesson-radar-card">
        <svg viewBox={`0 0 ${size} ${size}`} className="lesson-radar-svg">
          {levels.map((level: number) => {
            const levelRadius = radius * (level / 100);
            const path = objectiveCoverage
              .map((_: LessonObjectiveMetric, index: number) => {
                const angle =
                  (Math.PI * 2 * index) / objectiveCoverage.length - Math.PI / 2;
                const x = center + Math.cos(angle) * levelRadius;
                const y = center + Math.sin(angle) * levelRadius;
                return `${x},${y}`;
              })
              .join(' ');

            return (
              <polygon
                key={level}
                points={path}
                className="lesson-radar-grid"
              />
            );
          })}

          {objectiveCoverage.map((objective: LessonObjectiveMetric, index: number) => {
            const angle = (Math.PI * 2 * index) / objectiveCoverage.length - Math.PI / 2;
            const x = center + Math.cos(angle) * radius;
            const y = center + Math.sin(angle) * radius;
            return (
              <line
                key={objective.objective_title}
                x1={center}
                y1={center}
                x2={x}
                y2={y}
                className="lesson-radar-axis"
              />
            );
          })}

          <polygon points={points.join(' ')} className="lesson-radar-shape" />

          {radarPoints.map(({ objective, x, y }) => {
            return (
              <g key={`${objective.objective_title}-point`}>
                <circle
                  cx={x}
                  cy={y}
                  r="12"
                  className="lesson-radar-hit-area"
                  onMouseEnter={() =>
                    setChartHoveredObjectiveTitle(objective.objective_title)
                  }
                  onFocus={() =>
                    setChartHoveredObjectiveTitle(objective.objective_title)
                  }
                  onMouseLeave={() => setChartHoveredObjectiveTitle(null)}
                />
                <circle
                  cx={x}
                  cy={y}
                  r="4"
                  className={`lesson-radar-point ${
                    chartHoveredObjectiveTitle === objective.objective_title
                      ? 'lesson-radar-point-active'
                      : ''
                  }`}
                />
              </g>
            );
          })}
        </svg>

        {hoveredRadarPoint ? (
          <div
            className="lesson-radar-chart-tooltip"
            style={{
              left: `${(hoveredRadarPoint.x / size) * 100}%`,
              top: `${(hoveredRadarPoint.y / size) * 100}%`,
            }}
          >
            <strong>{hoveredRadarPoint.objective.objective_title}</strong>
          </div>
        ) : null}

        <div className="lesson-radar-legend">
          {objectiveCoverage.map((objective: LessonObjectiveMetric) => (
            <button
              key={objective.objective_title}
              type="button"
              className={`lesson-radar-legend-item ${
                detailObjectiveTitle === objective.objective_title
                  ? 'lesson-radar-legend-item-active'
                  : ''
              }`}
              onMouseEnter={() => setDetailObjectiveTitle(objective.objective_title)}
              onFocus={() => setDetailObjectiveTitle(objective.objective_title)}
            >
              <span className="lesson-radar-dot" />
              <span>{objective.objective_title}</span>
              <strong>{objective.mastery_score}%</strong>
            </button>
          ))}
        </div>

      </div>
    );
  }

  if (!shouldShowLesson) {
    return null;
  }

  const coachDrawerPortal =
    !isSummaryView && coachDrawerOpen
      ? createPortal(
          <>
            <div
              className="lesson-coach-overlay lesson-coach-overlay-open"
              onClick={() => setCoachDrawerOpen(false)}
            />
            <aside className="lesson-coach-drawer lesson-coach-drawer-open">
              <div className="study-chat-card lesson-chat-card lesson-chat-card-drawer">
                <div className="study-chat-header">
                  <div className="lesson-chat-drawer-topbar">
                    <div className="study-chat-title">
                      <Bot size={16} />
                      <span>Learn More</span>
                    </div>
                    <button
                      type="button"
                      className="lesson-drawer-close"
                      onClick={() => setCoachDrawerOpen(false)}
                      aria-label="Close learn more drawer"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <span className="study-chat-helper">
                    Ask for hints or concept help. The coach will not reveal the answer.
                  </span>
                </div>

                <div className="study-chat-messages">
                  {messages.length === 0 ? (
                    <div className="study-chat-empty">
                      <Bot size={18} />
                      <span>
                        Need help? Ask the coach for a hint or a quick explanation of
                        the current objective.
                      </span>
                    </div>
                  ) : (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        className={`study-chat-message study-chat-message-${message.role}`}
                      >
                        <div className="study-chat-role">
                          {message.role === 'assistant' ? 'Coach' : 'You'}
                        </div>
                        <div className="study-chat-content">{message.content}</div>
                      </div>
                    ))
                  )}
                </div>

                <div className="study-chat-composer">
                  <textarea
                    className="input study-chat-textarea"
                    placeholder="Ask for a hint or tell the coach what concept you want clarified."
                    value={coachDraft}
                    onChange={(event) => setCoachDraft(event.target.value)}
                    onKeyDown={handleCoachComposerKeyDown}
                    disabled={streaming}
                  />
                  <div className="study-chat-composer-footer">
                    {error ? (
                      <span className="study-chat-error">{error}</span>
                    ) : (
                      <span className="study-chat-helper">
                        The coach will guide you without spoiling the answer.
                      </span>
                    )}
                    <Button
                      loading={streaming}
                      onClick={() => void sendCoachMessage(coachDraft)}
                      disabled={streaming || !coachDraft.trim()}
                    >
                      {!streaming ? <SendHorizonal size={16} /> : null}
                      Send
                    </Button>
                  </div>
                </div>
              </div>
            </aside>
          </>,
          document.body,
        )
      : null;

  const regenerateSetupModal = regenerateSetupOpen && regeneratePlan ? (
    <Modal
      title="Regenerate quiz"
      onClose={closeRegenerateSetup}
      footer={
        <>
          <Button variant="ghost" onClick={closeRegenerateSetup}>
            Cancel
          </Button>
          <Button
            loading={regeneratingPlan || startingLesson}
            disabled={regeneratingPlan || startingLesson}
            onClick={() => void confirmRegenerateQuiz()}
          >
            <Sparkles size={16} />
            {hasPendingDifficultyChange ? 'Update plan' : 'Generate quiz'}
          </Button>
        </>
      }
    >
      <div className="lesson-regenerate-setup">
        <p className="lesson-regenerate-intro">
          Choose the difficulty and topics you want covered before generating a new
          quiz.
        </p>

        <label className="study-plan-empty-field">
          <span>Difficulty level</span>
          <div className="select-shell study-plan-difficulty-shell">
            <select
              className="input study-plan-difficulty-select"
              value={selectedDifficulty}
              onChange={(event) =>
                setSelectedDifficulty(event.target.value as StudyPlanDifficulty)
              }
              disabled={regeneratingPlan || startingLesson}
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
            Changing difficulty will regenerate the study plan first. Review the new
            topics before generating the quiz.
          </p>
        ) : null}

        <div className="study-plan-stats lesson-regenerate-stats">
          <div className="study-plan-stat">
            <span className="study-plan-stat-value">{includedRegenerateTopicCount}</span>
            <span className="study-plan-stat-label">Topics selected</span>
          </div>
          <div className="study-plan-stat">
            <span className="study-plan-stat-value">
              {includedRegenerateSubtopicCount}
            </span>
            <span className="study-plan-stat-label">Subtopics selected</span>
          </div>
        </div>

        <div className="lesson-regenerate-topics">
          {regeneratePlan.topics.map((topic) => (
            <div key={topic.id} className="study-plan-topic-card">
              <div className="study-plan-topic-header">
                <label className="study-plan-checkbox-row">
                  <input
                    type="checkbox"
                    checked={topic.included}
                    onChange={(event) =>
                      void updateRegenerateTopic(topic.id, event.target.checked)
                    }
                    disabled={regeneratingPlan || startingLesson}
                  />
                  <div>
                    <div className="study-plan-topic-title">{topic.title}</div>
                    {topic.description ? (
                      <div className="study-plan-topic-description">
                        {topic.description}
                      </div>
                    ) : null}
                  </div>
                </label>
                <button
                  type="button"
                  className="study-plan-toggle"
                  onClick={() => toggleRegenerateTopic(topic.id)}
                  aria-label={
                    openRegenerateTopics[topic.id]
                      ? `Collapse ${topic.title}`
                      : `Expand ${topic.title}`
                  }
                >
                  {openRegenerateTopics[topic.id] ? (
                    <ChevronUp size={18} />
                  ) : (
                    <ChevronDown size={18} />
                  )}
                </button>
              </div>
              {openRegenerateTopics[topic.id] ? (
                <div className="study-plan-subtopics">
                  {topic.subtopics.map((subtopic) => (
                    <label
                      key={subtopic.id}
                      className="study-plan-checkbox-row subtopic"
                    >
                      <input
                        type="checkbox"
                        checked={subtopic.included}
                        onChange={(event) =>
                          void updateRegenerateSubtopic(
                            subtopic.id,
                            event.target.checked,
                          )
                        }
                        disabled={regeneratingPlan || startingLesson}
                      />
                      <div>
                        <div className="study-plan-subtopic-title">
                          {subtopic.title}
                        </div>
                        {subtopic.description ? (
                          <div className="study-plan-subtopic-description">
                            {subtopic.description}
                          </div>
                        ) : null}
                      </div>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {regenerateError ? (
          <span className="study-chat-error">{regenerateError}</span>
        ) : null}
      </div>
    </Modal>
  ) : null;

  return (
    <>
      {coachDrawerPortal}
      {regenerateSetupModal}
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

            {isSummaryView && renderSummary()}

            {!isSummaryView && currentQuestion ? (
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
                    <div className="lesson-progress-chip">
                      {lesson.correct_answers} completed
                    </div>
                    <div className="lesson-weight-chip">
                      Weight {currentQuestion.weightage}
                    </div>
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
                    <label key={index} className={getChoiceClass(index)}>
                      <input
                        type="radio"
                        name={`question-${currentQuestion.id}`}
                        checked={selectedChoiceIndex === index}
                        onChange={() => setSelectedChoiceIndex(index)}
                        disabled={submitting || feedback?.correct === true}
                      />
                      <span>{choice}</span>
                    </label>
                  ))}
                </div>

                <div className="lesson-actions">
                  <Button
                    onClick={() => void submitAnswer()}
                    loading={submitting}
                    disabled={selectedChoiceIndex === null || submitting || feedback?.correct === true}
                  >
                    Submit answer
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={askToLearnMore}
                    disabled={streaming || submitting}
                  >
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
                      <Button onClick={goToNextQuestion}>
                        {feedback.completed ? 'View results' : 'Next Quiz'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
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
