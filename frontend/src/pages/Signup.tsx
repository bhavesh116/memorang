import SignupForm from '@/components/auth/SignupForm';
import AuthLayout from '@/components/auth/AuthLayout';
import { Sparkles, Lock, Zap } from 'lucide-react';

export default function Signup() {
  return (
    <AuthLayout
      title="Start Learning"
      subtitle="Join Memorang and let AI turn your study materials into interactive lessons tailored just for you."
      features={[
        { icon: <Sparkles size={20} />, text: 'Free to get started — no credit card' },
        { icon: <Lock size={20} />, text: 'Your data is private and secure' },
        { icon: <Zap size={20} />, text: 'Upload & start learning in minutes' },
      ]}
    >
      <SignupForm />
    </AuthLayout>
  );
}
