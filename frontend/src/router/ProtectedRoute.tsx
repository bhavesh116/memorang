import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: Props) {
  const { session } = useAuth();

  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
