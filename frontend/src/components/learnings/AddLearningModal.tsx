import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { AppDispatch, RootState } from '@/store';
import { createLearning } from '@/store/learningsSlice';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

interface Props {
  onClose: () => void;
}

export default function AddLearningModal({ onClose }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { loading } = useSelector((s: RootState) => s.learnings);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) { setError('Title is required.'); return; }

    const result = await dispatch(createLearning({ title: trimmed, description: description.trim() || undefined }));

    if (createLearning.fulfilled.match(result)) {
      onClose();
      navigate(`/dashboard/learnings/${result.payload.id}`);
    } else {
      setError(result.payload as string || 'Failed to create learning.');
    }
  };

  return (
    <Modal
      title="New Learning"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            form="add-learning-form"
            type="submit"
            loading={loading}
          >
            Create Learning
          </Button>
        </>
      }
    >
      {error && (
        <div className="msg msg-error" style={{ marginBottom: '1rem' }}>
          <span><AlertTriangle size={16} /></span> {error}
        </div>
      )}
      <form id="add-learning-form" onSubmit={handleSubmit}>
        <Input
          label="Title *"
          id="learning-title"
          type="text"
          value={title}
          onChange={(e) => { setTitle((e.target as HTMLInputElement).value); setError(''); }}
          placeholder="e.g. Machine Learning Fundamentals"
          autoFocus
          required
        />
        <Input
          label="Description (optional)"
          id="learning-description"
          multiline
          rows={3}
          value={description}
          onChange={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
          placeholder="What do you want to learn about?"
        />
      </form>
    </Modal>
  );
}
