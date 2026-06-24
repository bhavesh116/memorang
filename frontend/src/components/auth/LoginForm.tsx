import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertTriangle } from 'lucide-react';

export default function LoginForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <div className="auth-form-card">
      <h2>Welcome back</h2>
      <p className="auth-subtitle">Sign in to continue your learning journey</p>

      {error && (
        <div className="msg msg-error">
          <span><AlertTriangle size={16} /></span> {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Email */}
        <div className="input-group">
          <label className="input-label" htmlFor="login-email">Email address</label>
          <input
            id="login-email"
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </div>

        {/* Password with show/hide */}
        <div className="input-group">
          <label className="input-label" htmlFor="login-password">Password</label>
          <div className="password-wrapper">
            <input
              id="login-password"
              className="input password-input"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={loading}
          style={{ marginTop: '0.5rem' }}
        >
          Sign In
        </Button>
      </form>

      <p className="auth-footer">
        Don&apos;t have an account?{' '}
        <Link to="/signup">Create one free</Link>
      </p>
    </div>
  );
}
