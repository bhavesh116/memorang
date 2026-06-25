import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import PasswordInput from '@/components/ui/PasswordInput';
import ErrorAlert from '@/components/ui/ErrorAlert';
import { Link, useNavigate } from 'react-router-dom';

export default function SignupForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    const { data, error: authError } = await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (authError) {
      setError(authError.message);
    } else if (data.session) {
      navigate('/dashboard');
    } else {
      setError('Account created but email confirmation is still required. Please check your inbox.');
    }
  };

  return (
    <div className="auth-form-card">
      <h2>Create account</h2>
      <p className="auth-subtitle">Start learning smarter with AI-powered lessons</p>

      {error && <ErrorAlert message={error} />}

      <form onSubmit={handleSubmit}>
        <Input
          id="signup-email"
          label="Email address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoComplete="email"
        />

        <PasswordInput
          id="signup-password"
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Min. 8 characters"
          required
          autoComplete="new-password"
        />

        <PasswordInput
          id="signup-confirm"
          label="Confirm password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repeat your password"
          required
          autoComplete="new-password"
        />

        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={loading}
          style={{ marginTop: '0.5rem' }}
        >
          Create Account
        </Button>
      </form>

      <p className="auth-footer">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}
