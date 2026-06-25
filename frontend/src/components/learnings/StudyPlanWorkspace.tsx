import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageSquare,
  RefreshCw,
  SendHorizonal,
  Sparkles,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { AppDispatch } from '@/store';
import { fetchLearningById } from '@/store/learningsSlice';
import { api } from '@/lib/api';
import type {
  Learning,
  LearningChatMessage,
  StudyWorkspace,
} from '@/types/learning';

interface Props {
  learning: Learning;
}

type StudyPlanDifficulty = 'Easy' | 'Intermediate' | 'Hard';

export default function StudyPlanWorkspace({ learning }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const [workspace, setWorkspace] = useState<StudyWorkspace | null>(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [approvingPlan, setApprovingPlan] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [selectedDifficulty, setSelectedDifficulty] =
    useState<StudyPlanDifficulty>('Intermediate');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [openTopics, setOpenTopics] = useState<Record<string, boolean>>({});
  const assistantDraftRef = useRef('');

  const shouldLoadWorkspace =
    learning.ingestion_status === 'completed' ||
    learning.plan_status === 'generating' ||
    learning.plan_status === 'ready_for_review' ||
    learning.plan_status === 'approved' ||
    learning.plan_status === 'failed';

  useEffect(() => {
    if (!shouldLoadWorkspace) {
      return;
    }

    void loadWorkspace();
  }, [learning.id, shouldLoadWorkspace, learning.plan_status, learning.stage]);

  const plan = workspace?.plan ?? null;
  const messages = workspace?.messages ?? [];
  const includedTopicCount = useMemo(
    () => (plan?.topics ?? []).filter((topic) => topic.included).length,
    [plan],
  );
  const includedSubtopicCount = useMemo(
    () =>
      (plan?.topics ?? []).reduce(
        (count, topic) =>
          count + topic.subtopics.filter((subtopic) => subtopic.included).length,
        0,
      ),
    [plan],
  );
  const canEditPlan = learning.plan_status !== 'approved';
  const showGeneratingState = generatingPlan || learning.plan_status === 'generating';
  const planActionBusy = generatingPlan || approvingPlan;
  const displayedDifficulty = plan?.difficulty ?? 'Intermediate';
  const hasPendingDifficultyChange = plan
    ? selectedDifficulty !== displayedDifficulty
    : false;

  useEffect(() => {
    if (!plan) {
      return;
    }

    setOpenTopics((current) => {
      const nextState: Record<string, boolean> = {};
      for (const topic of plan.topics) {
        nextState[topic.id] = current[topic.id] ?? false;
      }
      return nextState;
    });
  }, [plan]);

  useEffect(() => {
    if (plan?.difficulty) {
      setSelectedDifficulty(plan.difficulty);
    }
  }, [plan?.difficulty]);

  async function loadWorkspace() {
    setLoadingWorkspace(true);
    setError(null);
    try {
      const { workspace: nextWorkspace } = await api.learnings.getPlanWorkspace(
        learning.id,
      );
      setWorkspace(nextWorkspace);
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      setLoadingWorkspace(false);
    }
  }

  async function regeneratePlan(difficulty: StudyPlanDifficulty) {
    setGeneratingPlan(true);
    setError(null);
    try {
      const { plan: generatedPlan } = await api.learnings.regeneratePlan(
        learning.id,
        difficulty,
      );
      setWorkspace((current) =>
        current
          ? {
              ...current,
              plan: generatedPlan,
            }
          : {
              plan: generatedPlan,
              thread: null,
              messages: [],
            },
      );
      await dispatch(fetchLearningById(learning.id));
      await loadWorkspace();
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      setGeneratingPlan(false);
    }
  }

  async function updateTopic(topicId: string, included: boolean) {
    if (!plan) return;
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

  async function updateSubtopic(subtopicId: string, included: boolean) {
    if (!plan) return;
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

  async function approvePlan() {
    if (!plan) return;
    setApprovingPlan(true);
    setError(null);
    try {
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
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      setApprovingPlan(false);
    }
  }

  async function sendChat() {
    if (!draft.trim() || streaming) {
      return;
    }

    const message = draft.trim();
    setDraft('');
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
      await api.learnings.streamPlanChat(learning.id, message, {
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
        onToken: (text) => {
          assistantDraftRef.current += text;
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
        onPlan: ({ plan: updatedPlan }) => {
          setWorkspace((current) =>
            current
              ? {
                  ...current,
                  plan: updatedPlan,
                }
              : current,
          );
        },
        onError: (messageText) => {
          setError(messageText);
        },
      });
      await dispatch(fetchLearningById(learning.id));
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      setStreaming(false);
    }
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void sendChat();
  }

  function toggleTopic(topicId: string) {
    setOpenTopics((current) => ({
      ...current,
      [topicId]: !current[topicId],
    }));
  }

  if (!shouldLoadWorkspace) {
    return null;
  }

  return (
    <div className="detail-section">
      <div className="detail-section-title">
        <span><Sparkles size={20} /></span> Study Plan
      </div>

      {loadingWorkspace && !workspace && !showGeneratingState ? (
        <div className="study-plan-empty-state">
          <Loader2 size={18} className="animate-spin" />
          <span>Loading study plan workspace…</span>
        </div>
      ) : showGeneratingState ? (
        <div className="study-plan-generating-state">
          <div className="study-plan-generating-copy">
            <div className="study-plan-generating-badge">
              <Sparkles size={16} />
              <span>Generating study plan</span>
            </div>
            <h3>Building your {selectedDifficulty.toLowerCase()} learning path</h3>
            <p>
              The study agent is organizing topics, sequencing subtopics, and
              tailoring the plan to your selected difficulty.
            </p>
          </div>
          <div className="study-plan-generating-visual" aria-hidden="true">
            <div className="study-plan-orbit study-plan-orbit-outer" />
            <div className="study-plan-orbit study-plan-orbit-middle" />
            <div className="study-plan-orbit study-plan-orbit-inner" />
            <div className="study-plan-core">
              <Sparkles size={24} />
            </div>
          </div>
          <div className="study-plan-generating-steps">
            <div className="study-plan-generating-step shimmer">
              <span>Reading the indexed PDF context</span>
            </div>
            <div className="study-plan-generating-step shimmer">
              <span>Grouping concepts into focused topics</span>
            </div>
            <div className="study-plan-generating-step shimmer">
              <span>Adjusting scope for {selectedDifficulty} difficulty</span>
            </div>
          </div>
        </div>
      ) : learning.plan_status === 'failed' && !plan ? (
        <div className="study-plan-empty-state">
          <span>{learning.plan_error || 'Plan generation failed.'}</span>
          <Button onClick={() => void regeneratePlan(selectedDifficulty)} loading={generatingPlan}>
            <RefreshCw size={16} /> Generate again
          </Button>
        </div>
      ) : !plan ? (
        <div className="study-plan-empty-state study-plan-empty-state-rich">
          <div className="study-plan-empty-copy">
            <span className="study-plan-empty-kicker">Study plan ready to create</span>
            <h3>Choose a difficulty and generate your study plan</h3>
            <p>
              Your PDF and embeddings are ready. Pick how challenging you want
              the material to feel, then generate the plan.
            </p>
          </div>
          <div className="study-plan-empty-controls">
            <label className="study-plan-empty-field">
              <span>Difficulty level</span>
              <div className="select-shell study-plan-difficulty-shell">
                <select
                  className="input study-plan-difficulty-select"
                  value={selectedDifficulty}
                  onChange={(event) =>
                    setSelectedDifficulty(event.target.value as StudyPlanDifficulty)
                  }
                  disabled={generatingPlan}
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
          </div>
          <Button
            onClick={() => void regeneratePlan(selectedDifficulty)}
            loading={generatingPlan}
            disabled={generatingPlan}
          >
            <Sparkles size={16} /> Generate plan
          </Button>
        </div>
      ) : (
        <div className="study-plan-layout">
          <div className="study-plan-column">
            <div className="study-plan-summary-card">
              <div className="study-plan-summary-head">
                <div>
                  <div className="study-plan-summary-topline">
                    <span>Lesson Difficulty</span>
                    <span>Version {plan.version}</span>
                  </div>
                  <div className="study-plan-difficulty-row">
                    <div className="select-shell study-plan-difficulty-shell">
                      <select
                        className="input study-plan-difficulty-select"
                        value={selectedDifficulty}
                        onChange={(event) =>
                          setSelectedDifficulty(
                            event.target.value as StudyPlanDifficulty,
                          )
                        }
                        disabled={
                          !canEditPlan ||
                          loadingWorkspace ||
                          planActionBusy
                        }
                      >
                        <option value="Easy">Easy</option>
                        <option value="Intermediate">Intermediate</option>
                        <option value="Hard">Hard</option>
                      </select>
                      <span className="select-shell-icon" aria-hidden="true">
                        <ChevronDown size={16} />
                      </span>
                    </div>
                  </div>
                  {hasPendingDifficultyChange ? (
                    <p className="study-plan-difficulty-helper">
                      Difficulty changes apply only after you regenerate the plan.
                    </p>
                  ) : null}
                  <h3>{plan.title}</h3>
                </div>
                <div className="study-plan-actions study-plan-actions-top">
                  <Button
                    onClick={approvePlan}
                    loading={approvingPlan && learning.plan_status !== 'approved'}
                    disabled={
                      streaming ||
                      generatingPlan ||
                      hasPendingDifficultyChange ||
                      learning.plan_status === 'approved'
                    }
                  >
                    <CheckCircle2 size={16} />
                    {learning.plan_status === 'approved'
                      ? 'Plan approved'
                      : 'Approve selected plan'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void regeneratePlan(
                        selectedDifficulty,
                      )
                    }
                    loading={generatingPlan}
                    disabled={streaming || approvingPlan}
                  >
                    <RefreshCw size={16} /> Regenerate plan
                  </Button>
                </div>
              </div>
              <p>{plan.summary}</p>
              {plan.rationale && (
                <p className="study-plan-rationale">{plan.rationale}</p>
              )}
              <div className="study-plan-stats">
                <div className="study-plan-stat">
                  <span className="study-plan-stat-value">{includedTopicCount}</span>
                  <span className="study-plan-stat-label">Topics selected</span>
                </div>
                <div className="study-plan-stat">
                  <span className="study-plan-stat-value">{includedSubtopicCount}</span>
                  <span className="study-plan-stat-label">Subtopics selected</span>
                </div>
                <div className="study-plan-stat">
                  <span className="study-plan-stat-value">{plan.topics.length}</span>
                  <span className="study-plan-stat-label">Total topics</span>
                </div>
              </div>
            </div>

            <div className="study-plan-topics">
              {plan.topics.map((topic) => (
                <div key={topic.id} className="study-plan-topic-card">
                  <div className="study-plan-topic-header">
                    <label className="study-plan-checkbox-row">
                      <input
                        type="checkbox"
                        checked={topic.included}
                        onChange={(event) =>
                          void updateTopic(topic.id, event.target.checked)
                        }
                      />
                      <div>
                        <div className="study-plan-topic-title">{topic.title}</div>
                        {topic.description && (
                          <div className="study-plan-topic-description">
                            {topic.description}
                          </div>
                        )}
                      </div>
                    </label>
                    <button
                      type="button"
                      className="study-plan-toggle"
                      onClick={() => toggleTopic(topic.id)}
                      aria-label={
                        openTopics[topic.id]
                          ? `Collapse ${topic.title}`
                          : `Expand ${topic.title}`
                      }
                    >
                      {openTopics[topic.id] ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>
                  {openTopics[topic.id] && (
                    <div className="study-plan-subtopics">
                      {topic.subtopics.map((subtopic) => (
                        <label key={subtopic.id} className="study-plan-checkbox-row subtopic">
                          <input
                            type="checkbox"
                            checked={subtopic.included}
                            onChange={(event) =>
                              void updateSubtopic(subtopic.id, event.target.checked)
                            }
                          />
                          <div>
                            <div className="study-plan-subtopic-title">
                              {subtopic.title}
                            </div>
                            {subtopic.description && (
                              <div className="study-plan-subtopic-description">
                                {subtopic.description}
                              </div>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="study-plan-column">
            <div className="study-chat-card">
              <div className="study-chat-header">
                <div className="study-chat-title">
                  <MessageSquare size={16} />
                  <span>Chat With The Agent</span>
                </div>
                <span className="study-chat-helper">
                  Ask to focus on or omit topics before approval.
                </span>
              </div>

              <div className="study-chat-messages">
                {messages.length === 0 ? (
                  <div className="study-chat-empty">
                    <Bot size={18} />
                    <span>
                      Ask the agent to focus on selected topics, omit sections, or
                      explain what each topic covers.
                    </span>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`study-chat-message study-chat-message-${message.role}`}
                    >
                      <div className="study-chat-role">
                        {message.role === 'assistant' ? 'Agent' : 'You'}
                      </div>
                      <div className="study-chat-content">{message.content}</div>
                    </div>
                  ))
                )}
              </div>

              <div className="study-chat-composer">
                <textarea
                  className="input study-chat-textarea"
                  placeholder="Example: I only want to learn imaging anatomy, pathology patterns, and fracture interpretation."
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  disabled={streaming}
                />
                <div className="study-chat-composer-footer">
                  {error ? (
                    <span className="study-chat-error">{error}</span>
                  ) : (
                    <span className="study-chat-helper">
                      Streaming replies are saved, so refreshes will not lose the conversation.
                    </span>
                  )}
                  <Button
                    loading={streaming}
                    onClick={sendChat}
                    disabled={streaming || !draft.trim()}
                  >
                    {!streaming ? <SendHorizonal size={16} /> : null}
                    Send
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
