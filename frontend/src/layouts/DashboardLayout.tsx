import { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '@/store';
import { fetchLearnings } from '@/store/learningsSlice';
import Sidebar from '@/components/learnings/Sidebar';
import AddLearningModal from '@/components/learnings/AddLearningModal';
import DashboardHome from '@/components/dashboard/DashboardHome';
import LearningPage from '@/pages/LearningPage';

export default function DashboardLayout() {
  const dispatch = useDispatch<AppDispatch>();
  const [showModal, setShowModal] = useState(false);

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
