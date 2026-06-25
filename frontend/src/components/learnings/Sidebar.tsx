import { useSelector, useDispatch } from 'react-redux';
import { useNavigate, useMatch } from 'react-router-dom';
import { Brain, Library, Trash2, LogOut, Loader2, AlertTriangle } from 'lucide-react';
import { RootState, AppDispatch } from '@/store';
import { deleteLearning } from '@/store/learningsSlice';
import { useAuth } from '@/contexts/AuthContext';
import { STAGE_ICONS } from '@/lib/stageIcons';
import Badge from '@/components/ui/Badge';
import { INGESTION_LABELS, type Learning } from '@/types/learning';

interface Props {
  onAddNew: () => void;
}

export default function Sidebar({ onAddNew }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { email, signOut } = useAuth();
  const { items, loading } = useSelector((s: RootState) => s.learnings);
  const learningMatch = useMatch('/dashboard/learnings/:id');
  const selectedId = learningMatch?.params.id ?? null;

  const handleSelect = (learning: Learning) => {
    navigate(`/dashboard/learnings/${learning.id}`);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm('Delete this learning? This cannot be undone.')) return;
    await dispatch(deleteLearning(id));
    if (selectedId === id) {
      navigate('/dashboard');
    }
  };

  const avatarLetter = email ? email[0].toUpperCase() : '?';

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon"><Brain size={24} /></div>
          <span className="sidebar-brand-name">Memorang</span>
        </div>
        <button id="sidebar-add-btn" className="sidebar-add-btn" onClick={onAddNew}>
          <span>+</span> New Learning
        </button>
      </div>

      <div className="sidebar-section-label">My Learnings</div>

      <div className="sidebar-list">
        {loading && items.length === 0 ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="sidebar-item" style={{ cursor: 'default', gap: '0.625rem' }}>
              <div className="skeleton" style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 8 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="skeleton" style={{ height: 12, borderRadius: 4 }} />
                <div className="skeleton" style={{ height: 10, width: '55%', borderRadius: 4 }} />
              </div>
            </div>
          ))
        ) : items.length === 0 ? (
          <div className="sidebar-empty">
            <span className="sidebar-empty-icon"><Library size={32} /></span>
            <p>No learnings yet.<br />Click <strong>+ New Learning</strong> to start.</p>
          </div>
        ) : (
          items.map((learning, idx) => (
            <div
              key={learning.id}
              id={`sidebar-item-${learning.id}`}
              className={`sidebar-item ${selectedId === learning.id ? 'active' : ''}`}
              onClick={() => handleSelect(learning)}
              role="button"
              tabIndex={0}
              style={{ animationDelay: `${idx * 0.04}s` }}
              onKeyDown={(e) => e.key === 'Enter' && handleSelect(learning)}
            >
              <div className="sidebar-item-icon">{STAGE_ICONS[learning.stage]}</div>
              <div className="sidebar-item-info">
                <div className="sidebar-item-title">{learning.title}</div>
                <div className="sidebar-item-stage">
                  <Badge stage={learning.stage} showDot={false} />
                </div>
                {learning.stage === 'study_uploaded' && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      marginTop: '0.35rem',
                      fontSize: '0.72rem',
                      color:
                        learning.ingestion_status === 'failed'
                          ? 'var(--danger)'
                          : 'var(--text-muted)',
                    }}
                  >
                    {(
                      learning.ingestion_status === 'uploaded' ||
                      learning.ingestion_status === 'queued' ||
                      learning.ingestion_status === 'analyzing' ||
                      learning.ingestion_status === 'embedding'
                    ) && <Loader2 size={12} className="animate-spin" />}
                    {learning.ingestion_status === 'failed' && <AlertTriangle size={12} />}
                    <span>{INGESTION_LABELS[learning.ingestion_status]}</span>
                  </div>
                )}
              </div>
              <button
                className="sidebar-item-delete"
                onClick={(e) => handleDelete(e, learning.id)}
                aria-label={`Delete ${learning.title}`}
                title="Delete learning"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="sidebar-footer">
        <button
          id="sidebar-signout-btn"
          className="sidebar-user"
          onClick={() => void signOut()}
          title="Sign out"
        >
          <div className="sidebar-avatar">{avatarLetter}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-email">{email || 'Loading…'}</div>
            <div className="sidebar-user-label">Click to sign out</div>
          </div>
          <span className="sidebar-signout-icon"><LogOut size={16} /></span>
        </button>
      </div>
    </aside>
  );
}
