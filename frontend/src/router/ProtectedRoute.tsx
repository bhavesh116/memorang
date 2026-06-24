import { Navigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';

interface Props {
  session: Session | null;
  children: React.ReactNode;
}

export default function ProtectedRoute({ session, children }: Props) {
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
