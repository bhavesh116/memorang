import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { LearningPlanTopic } from '@/types/learning';

interface Props {
  topics: LearningPlanTopic[];
  onTopicChange: (topicId: string, included: boolean) => void | Promise<void>;
  onSubtopicChange: (subtopicId: string, included: boolean) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
}

export function countIncludedTopics(topics: LearningPlanTopic[]) {
  const includedTopicCount = topics.filter((topic) => topic.included).length;
  const includedSubtopicCount = topics.reduce(
    (count, topic) =>
      count + topic.subtopics.filter((subtopic) => subtopic.included).length,
    0,
  );
  return { includedTopicCount, includedSubtopicCount };
}

export default function PlanTopicTree({
  topics,
  onTopicChange,
  onSubtopicChange,
  disabled = false,
  className = 'study-plan-topics',
}: Props) {
  const [openTopics, setOpenTopics] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOpenTopics((current) => {
      const nextState: Record<string, boolean> = {};
      for (const topic of topics) {
        nextState[topic.id] = current[topic.id] ?? false;
      }
      return nextState;
    });
  }, [topics]);

  const toggleTopic = (topicId: string) => {
    setOpenTopics((current) => ({
      ...current,
      [topicId]: !current[topicId],
    }));
  };

  return (
    <div className={className}>
      {topics.map((topic) => (
        <div key={topic.id} className="study-plan-topic-card">
          <div className="study-plan-topic-header">
            <label className="study-plan-checkbox-row">
              <input
                type="checkbox"
                checked={topic.included}
                onChange={(event) => void onTopicChange(topic.id, event.target.checked)}
                disabled={disabled}
              />
              <div>
                <div className="study-plan-topic-title">{topic.title}</div>
                {topic.description && (
                  <div className="study-plan-topic-description">{topic.description}</div>
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
                      void onSubtopicChange(subtopic.id, event.target.checked)
                    }
                    disabled={disabled}
                  />
                  <div>
                    <div className="study-plan-subtopic-title">{subtopic.title}</div>
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
  );
}
