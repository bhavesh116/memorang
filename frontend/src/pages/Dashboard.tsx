import { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Brain } from 'lucide-react';
import { AppDispatch } from '@/store';
import { fetchLearnings } from '@/store/learningsSlice';
import Sidebar from '@/components/learnings/Sidebar';
import AddLearningModal from '@/components/learnings/AddLearningModal';
import LearningPage from './LearningPage';
import Button from '@/components/ui/Button';

function DashboardHome({ onAddNew }: { onAddNew: () => void }) {
  return (
    <div className="dashboard-welcome">
      <div className="dashboard-welcome-icon"><Brain size={48} /></div>
      <h2>Ready to learn something new?</h2>
      <p>
        Create a learning, upload your PDF, and let Memorang generate
        an AI-powered interactive lesson just for you.
      </p>
      <Button id="welcome-add-btn" size="lg" onClick={onAddNew}>
        + Create your first Learning
      </Button>
    </div>
  );
}

export default function Dashboard() {
  const dispatch = useDispatch<AppDispatch>();
  const [showModal, setShowModal] = useState(false);

  // Fetch learnings when dashboard mounts
  useEffect(() => {
    dispatch(fetchLearnings());
  }, [dispatch]);

  return (
    <div className="dashboard-root">
      <Sidebar onAddNew={() => setShowModal(true)} />

      <main className="main-content">
        <Routes>
          <Route
            path="/"
            element={<DashboardHome onAddNew={() => setShowModal(true)} />}
          />
          <Route path="/learnings/:id" element={<LearningPage />} />
        </Routes>
      </main>

      {showModal && <AddLearningModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
