import LoginForm from '@/components/auth/LoginForm';
import { Brain, FileText, Bot, Target, BarChart } from 'lucide-react';

export default function Login() {
  return (
    <div className="auth-root">
      {/* Left hero panel */}
      <div className="auth-hero">
        <div className="auth-hero-content">
          <div className="auth-hero-logo"><Brain size={48} /></div>
          <h1>Memorang</h1>
          <p>
            Transform any PDF into an interactive AI-powered learning experience.
            Upload, study, and master new skills.
          </p>
          <div className="auth-hero-features">
            <div className="auth-hero-feature">
              <span><FileText size={20} /></span> Upload any PDF study material
            </div>
            <div className="auth-hero-feature">
              <span><Bot size={20} /></span> AI generates personalised lesson plans
            </div>
            <div className="auth-hero-feature">
              <span><Target size={20} /></span> Interactive MCQs with instant feedback
            </div>
            <div className="auth-hero-feature">
              <span><BarChart size={20} /></span> Track your learning progress
            </div>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="auth-form-panel">
        <LoginForm />
      </div>
    </div>
  );
}
