import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  role?: 'superadmin' | 'admin';
}

export default function ProtectedRoute({ children, role }: Props) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 32 }}>Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role && user.role !== 'superadmin') {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
