import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { Search } from 'lucide-react';
import { RootState, AppDispatch } from '@/store';
import { fetchLearningById, fetchLearningStatus, selectLearning } from '@/store/learningsSlice';
import LearningDetail from '@/components/learnings/LearningDetail';
import Spinner from '@/components/ui/Spinner';

export default function LearningPage() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();

  const { items, loading } = useSelector((s: RootState) => s.learnings);
  const learning = items.find((l) => l.id === id);

  // Sync selected ID in Redux when navigating directly via URL
  useEffect(() => {
    if (id) dispatch(selectLearning(id));
  }, [id, dispatch]);

  // Always refresh status while this learning is open.
  useEffect(() => {
    if (!id) {
      return undefined;
    }

    void dispatch(fetchLearningStatus(id));

    const interval = window.setInterval(() => {
      void dispatch(fetchLearningStatus(id));
    }, 3000);

    return () => window.clearInterval(interval);
  }, [id, dispatch]);

  useEffect(() => {
    if (id && !learning) {
      dispatch(fetchLearningById(id));
    }
  }, [dispatch, id, learning]);

  if (loading && !learning) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: '0.75rem',
          color: 'var(--text-muted)',
        }}
      >
        <Spinner />
        <span>Loading…</span>
      </div>
    );
  }

  if (!learning) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: '1rem',
          color: 'var(--text-muted)',
        }}
      >
        <span style={{ fontSize: '3rem' }}><Search size={48} /></span>
        <p>Learning not found.</p>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => navigate('/dashboard')}
        >
          ← Back to dashboard
        </button>
      </div>
    );
  }

  return <LearningDetail learning={learning} />;
}
