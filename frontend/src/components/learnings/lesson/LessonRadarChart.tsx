import { useState } from 'react';
import type { LessonObjectiveMetric } from '@/types/learning';

interface Props {
  objectiveCoverage: LessonObjectiveMetric[];
  maxObjectiveScore: number;
}

export default function LessonRadarChart({ objectiveCoverage, maxObjectiveScore }: Props) {
  const [chartHoveredObjectiveTitle, setChartHoveredObjectiveTitle] = useState<string | null>(
    null,
  );
  const [detailObjectiveTitle, setDetailObjectiveTitle] = useState<string | null>(null);

  const size = 260;
  const center = size / 2;
  const radius = 88;
  const levels = [25, 50, 75, 100];

  const radarPoints = objectiveCoverage.map((objective, index) => {
    const angle = (Math.PI * 2 * index) / objectiveCoverage.length - Math.PI / 2;
    const scaledRadius = radius * (objective.mastery_score / maxObjectiveScore);
    return {
      objective,
      x: center + Math.cos(angle) * scaledRadius,
      y: center + Math.sin(angle) * scaledRadius,
    };
  });

  const points = radarPoints.map((point) => `${point.x},${point.y}`);
  const hoveredRadarPoint =
    radarPoints.find(
      (point) => point.objective.objective_title === chartHoveredObjectiveTitle,
    ) ?? null;

  return (
    <div className="lesson-radar-card">
      <svg viewBox={`0 0 ${size} ${size}`} className="lesson-radar-svg">
        {levels.map((level) => {
          const levelRadius = radius * (level / 100);
          const path = objectiveCoverage
            .map((_, index) => {
              const angle =
                (Math.PI * 2 * index) / objectiveCoverage.length - Math.PI / 2;
              const x = center + Math.cos(angle) * levelRadius;
              const y = center + Math.sin(angle) * levelRadius;
              return `${x},${y}`;
            })
            .join(' ');

          return (
            <polygon key={level} points={path} className="lesson-radar-grid" />
          );
        })}

        {objectiveCoverage.map((objective, index) => {
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

        {radarPoints.map(({ objective, x, y }) => (
          <g key={`${objective.objective_title}-point`}>
            <circle
              cx={x}
              cy={y}
              r="12"
              className="lesson-radar-hit-area"
              onMouseEnter={() => setChartHoveredObjectiveTitle(objective.objective_title)}
              onFocus={() => setChartHoveredObjectiveTitle(objective.objective_title)}
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
        ))}
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
        {objectiveCoverage.map((objective) => (
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
