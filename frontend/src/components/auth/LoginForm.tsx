import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import PasswordInput from '@/components/ui/PasswordInput';
import ErrorAlert from '@/components/ui/ErrorAlert';
import { Link, useNavigate } from 'react-router-dom';

export default function LoginForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

      {error && <ErrorAlert message={error} />}

      <form onSubmit={handleSubmit}>
        <Input
          id="login-email"
          label="Email address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoComplete="email"
        />

        <PasswordInput
          id="login-password"
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          autoComplete="current-password"
        />

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
