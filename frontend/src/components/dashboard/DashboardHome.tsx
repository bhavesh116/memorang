import { Brain } from 'lucide-react';
import Button from '@/components/ui/Button';

interface Props {
  onAddNew: () => void;
}

export default function DashboardHome({ onAddNew }: Props) {
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
