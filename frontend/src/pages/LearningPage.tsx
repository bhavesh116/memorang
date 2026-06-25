import { useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { Search } from 'lucide-react';
import { RootState, AppDispatch } from '@/store';
import { fetchLearningById, fetchLearningStatus } from '@/store/learningsSlice';
import { usePolling } from '@/hooks/usePolling';
import LearningDetail from '@/components/learnings/LearningDetail';
import LoadingScreen from '@/components/ui/LoadingScreen';
import Button from '@/components/ui/Button';

export default function LearningPage() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();

  const { items, loading } = useSelector((s: RootState) => s.learnings);
  const learning = items.find((l) => l.id === id);

  const refreshStatus = useCallback(() => {
    if (id) {
      void dispatch(fetchLearningStatus(id));
    }
  }, [dispatch, id]);

  usePolling(refreshStatus, 3000, Boolean(id));

  useEffect(() => {
    if (id && !learning) {
      dispatch(fetchLearningById(id));
    }
  }, [dispatch, id, learning]);

  if (loading && !learning) {
    return <LoadingScreen fullHeight={false} />;
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
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
          ← Back to dashboard
        </Button>
      </div>
    );
  }

  return <LearningDetail learning={learning} />;
}
