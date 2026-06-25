import { Info } from 'lucide-react';
import { formatDurationMs } from '@/lib/formatDuration';
import type { LessonSummary } from '@/types/learning';
import LessonRadarChart from './LessonRadarChart';

interface Props {
  summary: LessonSummary;
}

function MetricInfo({ description, label }: { description: string; label: string }) {
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

export default function LessonSummaryView({ summary }: Props) {
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
            <MetricInfo
              description="The share of objectives you cleared without any wrong attempts."
              label="Mastery Index"
            />
          </div>
        </div>
        <div className="lesson-summary-card">
          <div className="lesson-summary-value">{summary.weighted_score}%</div>
          <div className="lesson-summary-label lesson-summary-label-with-info">
            <span>Weighted Score</span>
            <MetricInfo
              description="A weighted performance score that penalizes wrong attempts and hint usage more heavily on higher-weight questions."
              label="Weighted Score"
            />
          </div>
        </div>
        <div className="lesson-summary-card">
          <div className="lesson-summary-value">{summary.readiness_score}%</div>
          <div className="lesson-summary-label lesson-summary-label-with-info">
            <span>Readiness Score</span>
            <MetricInfo
              description="An overall readiness estimate combining weighted score, mastery index, and friction zones."
              label="Readiness Score"
            />
          </div>
        </div>
      </div>

      <div className="lesson-chart-grid">
        <div className="lesson-chart-card">
          <h4>Objective Coverage</h4>
          <LessonRadarChart
            objectiveCoverage={summary.objective_coverage}
            maxObjectiveScore={maxObjectiveScore}
          />
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
                <strong>{formatDurationMs(metric.avg_response_time_ms)}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="lesson-chart-card">
          <h4 className="lesson-chart-heading-with-info">
            <span>Friction Zones</span>
            <MetricInfo
              description="Questions you answered incorrectly multiple times, indicating areas that need more review."
              label="Friction Zones"
            />
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
