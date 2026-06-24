import SignupForm from '@/components/auth/SignupForm';
import { Brain, Sparkles, Lock, Zap } from 'lucide-react';

export default function Signup() {
  return (
    <div className="auth-root">
      {/* Left hero panel */}
      <div className="auth-hero">
        <div className="auth-hero-content">
          <div className="auth-hero-logo"><Brain size={48} /></div>
          <h1>Start Learning</h1>
          <p>
            Join Memorang and let AI turn your study materials into interactive
            lessons tailored just for you.
          </p>
          <div className="auth-hero-features">
            <div className="auth-hero-feature">
              <span><Sparkles size={20} /></span> Free to get started — no credit card
            </div>
            <div className="auth-hero-feature">
              <span><Lock size={20} /></span> Your data is private and secure
            </div>
            <div className="auth-hero-feature">
              <span><Zap size={20} /></span> Upload & start learning in minutes
            </div>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="auth-form-panel">
        <SignupForm />
      </div>
    </div>
  );
}
