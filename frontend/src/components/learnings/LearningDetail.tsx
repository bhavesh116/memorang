import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { AppDispatch } from '@/store';
import { fetchLearningStatus, restartIngestion } from '@/store/learningsSlice';
import {
  FileText,
  BarChart,
  Clipboard,
  CheckCircle,
  GraduationCap,
  Trophy,
  Check,
  Image as ImageIcon,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import PdfUploadZone from './PdfUploadZone';
import LessonWorkspace from './LessonWorkspace';
import StudyPlanWorkspace from './StudyPlanWorkspace';
import { INGESTION_LABELS, type Learning } from '@/types/learning';

interface Props {
  learning: Learning;
}

export default function LearningDetail({ learning }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const createdDate = new Date(learning.created_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const activeIngestion =
    learning.ingestion_status === 'uploaded' ||
    learning.ingestion_status === 'queued' ||
    learning.ingestion_status === 'analyzing' ||
    learning.ingestion_status === 'embedding';

  useEffect(() => {
    if (!activeIngestion) {
      return;
    }

    dispatch(fetchLearningStatus(learning.id));

    const interval = window.setInterval(() => {
      dispatch(fetchLearningStatus(learning.id));
    }, 5000);

    return () => window.clearInterval(interval);
  }, [activeIngestion, dispatch, learning.id]);

  const formatEta = (seconds?: number | null) => {
    if (!seconds || seconds <= 0) {
      return 'Calculating estimate…';
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes === 0) {
      return `~${remainingSeconds}s left`;
    }
    return `~${minutes}m ${remainingSeconds}s left`;
  };

  const progress = Math.max(
    0,
    Math.min(100, Math.round(learning.ingestion_progress_pct ?? 0)),
  );
  const isStudyPlanStage = learning.stage === 'study_uploaded';
  const isQuizStage =
    learning.stage === 'user_approved_study' ||
    learning.stage === 'lesson_in_progress';
  const isSummaryStage = learning.stage === 'lesson_complete';
  const shouldShowStudyMaterial =
    learning.stage === 'empty' ||
    learning.stage === 'study_upload_pending' ||
    activeIngestion ||
    learning.ingestion_status === 'failed';
  const shouldShowStatus = !isQuizStage && !isSummaryStage;

  return (
    <div className="learning-detail">
      {/* Header */}
      <div className="learning-detail-header">
        <div className="learning-detail-meta">
          <Badge stage={learning.stage} />
        </div>
        <h1 className="learning-detail-title">{learning.title}</h1>
        {learning.description && (
          <p className="learning-detail-description">{learning.description}</p>
        )}
        <p className="learning-detail-date">Created {createdDate}</p>
      </div>

      {/* PDF Section */}
      {shouldShowStudyMaterial && (
      <div className="detail-section">
        <div className="detail-section-title">
          <span><FileText size={20} /></span> Study Material
        </div>

        {learning.stage === 'study_uploaded' ||
        learning.stage === 'user_approved_study' ||
        learning.stage === 'lesson_in_progress' ||
        learning.stage === 'lesson_complete' ? (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {learning.pdf_url && (
              <a
                id="pdf-view-link"
                href={learning.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="pdf-link"
              >
                <FileText size={16} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> View uploaded PDF
              </a>
            )}

            <div
              style={{
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px',
                padding: '1rem',
                background: 'rgba(255,255,255,0.02)',
                display: 'grid',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    Ingestion status
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontWeight: 600 }}>
                    {activeIngestion && <Loader2 size={16} className="animate-spin" />}
                    {learning.ingestion_status === 'failed' && <AlertTriangle size={16} color="var(--danger)" />}
                    {INGESTION_LABELS[learning.ingestion_status]}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {activeIngestion
                    ? formatEta(learning.ingestion_eta_seconds)
                    : learning.ingestion_status === 'completed'
                    ? 'Ready for retrieval'
                    : learning.ingestion_status === 'failed'
                    ? 'Needs retry'
                    : 'Waiting to start'}
                </div>
              </div>

              <div>
                <div
                  style={{
                    width: '100%',
                    height: 10,
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.08)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${progress}%`,
                      height: '100%',
                      background:
                        learning.ingestion_status === 'failed'
                          ? 'linear-gradient(90deg, #ef4444, #f97316)'
                          : 'var(--accent-gradient)',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '0.5rem',
                    fontSize: '0.8rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  <span>{progress}% complete</span>
                  <span>
                    {learning.document_page_count ? `${learning.document_page_count} pages` : 'Page count pending'}
                    {learning.document_image_count !== null && learning.document_image_count !== undefined
                      ? ` • ${learning.document_image_count} images`
                      : ''}
                  </span>
                </div>
              </div>

              {learning.ingestion_error && (
                <div className="msg msg-error">
                  <span><AlertTriangle size={16} /></span> {learning.ingestion_error}
                </div>
              )}

              {learning.ingestion_status === 'failed' && (
                <div>
                  <Button onClick={() => dispatch(restartIngestion(learning.id))}>
                    Retry analysis
                  </Button>
                </div>
              )}
            </div>

            <p className="text-muted mt-4" style={{ fontSize: '0.85rem' }}>
              Uploaded PDFs are now processed asynchronously so large files can finish analysis in the background.
            </p>
          </div>
        ) : (
          <PdfUploadZone learningId={learning.id} />
        )}
      </div>
      )}

      {/* Stage info */}
      {shouldShowStatus && (
        <div className="detail-section">
          <div className="detail-section-title">
            <span><BarChart size={20} /></span> Status
          </div>
          <StageTimeline currentStage={learning.stage} />
        </div>
      )}

      {isStudyPlanStage && <StudyPlanWorkspace learning={learning} />}
      {(isQuizStage || isSummaryStage) && <LessonWorkspace learning={learning} />}

      {isStudyPlanStage && (learning.document_image_count ?? 0) > 0 && (
        <div className="detail-section">
          <div className="detail-section-title">
            <span><ImageIcon size={20} /></span> Extracted Visuals
          </div>
          <p className="text-muted" style={{ fontSize: '0.9rem' }}>
            {learning.document_image_count} images were extracted and linked to the indexed document chunks for later retrieval in explanations and quizzes.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Stage Timeline ──────────────────────────────────────────────────────────

const stages = [
  { key: 'empty',               label: 'Created',        icon: <Clipboard size={16} /> },
  { key: 'study_uploaded',      label: 'PDF Uploaded',   icon: <FileText size={16} /> },
  { key: 'user_approved_study', label: 'Plan Approved',  icon: <CheckCircle size={16} /> },
  { key: 'lesson_in_progress',  label: 'Quiz',           icon: <GraduationCap size={16} /> },
  { key: 'lesson_complete',     label: 'Complete',       icon: <Trophy size={16} /> },
] as const;

function StageTimeline({ currentStage }: { currentStage: string }) {
  const stageOrder = stages.map((s) => s.key);
  const currentIdx = stageOrder.indexOf(currentStage as typeof stages[number]['key']);

  return (
    <div style={{ display: 'flex', gap: '0', alignItems: 'stretch' }}>
      {stages.map((stage, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx || (currentStage === 'study_upload_pending' && idx === 1);
        return (
          <div
            key={stage.key}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.375rem',
              position: 'relative',
            }}
          >
            {/* Connector line */}
            {idx < stages.length - 1 && (
              <div
                style={{
                  position: 'absolute',
                  top: 14,
                  left: '50%',
                  width: '100%',
                  height: 2,
                  background: done
                    ? 'var(--accent)'
                    : 'rgba(255,255,255,0.08)',
                  zIndex: 0,
                }}
              />
            )}

            {/* Circle */}
            <div
              style={{
                width: 28, height: 28,
                borderRadius: '50%',
                background: done
                  ? 'var(--accent-gradient)'
                  : active
                  ? 'rgba(124,58,237,0.3)'
                  : 'rgba(255,255,255,0.06)',
                border: `2px solid ${done || active ? 'var(--accent)' : 'rgba(255,255,255,0.1)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem',
                position: 'relative',
                zIndex: 1,
                boxShadow: active ? 'var(--accent-glow-sm)' : 'none',
                transition: 'all 0.3s',
              }}
            >
              {done ? <Check size={16} /> : stage.icon}
            </div>

            {/* Label */}
            <span
              style={{
                fontSize: '0.65rem',
                color: done || active ? 'var(--text-secondary)' : 'var(--text-muted)',
                textAlign: 'center',
                lineHeight: 1.3,
                fontWeight: active ? 600 : 400,
              }}
            >
              {stage.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
