import LoginForm from '@/components/auth/LoginForm';
import AuthLayout from '@/components/auth/AuthLayout';
import { FileText, Bot, Target, BarChart } from 'lucide-react';

export default function Login() {
  return (
    <AuthLayout
      title="Memorang"
      subtitle="Transform any PDF into an interactive AI-powered learning experience. Upload, study, and master new skills."
      features={[
        { icon: <FileText size={20} />, text: 'Upload any PDF study material' },
        { icon: <Bot size={20} />, text: 'AI generates personalised lesson plans' },
        { icon: <Target size={20} />, text: 'Interactive MCQs with instant feedback' },
        { icon: <BarChart size={20} />, text: 'Track your learning progress' },
      ]}
    >
      <LoginForm />
    </AuthLayout>
  );
}
