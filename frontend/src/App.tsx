import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { store } from '@/store';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import Dashboard from '@/pages/Dashboard';
import ProtectedRoute from '@/router/ProtectedRoute';

function LoadingScreen() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg-root)',
        flexDirection: 'column',
        gap: '1rem',
      }}
    >
      <div className="spinner spinner-lg" style={{ color: 'var(--accent)' }} />
      <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
        Loading…
      </span>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <LoadingScreen />;

  return (
    <Provider store={store}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={<Navigate to={session ? '/dashboard' : '/login'} replace />}
          />
          <Route
            path="/login"
            element={session ? <Navigate to="/dashboard" replace /> : <Login />}
          />
          <Route
            path="/signup"
            element={session ? <Navigate to="/dashboard" replace /> : <Signup />}
          />
          <Route
            path="/dashboard/*"
            element={
              <ProtectedRoute session={session}>
                <Dashboard />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </Provider>
  );
}
