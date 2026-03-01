/**
 * Guard : auth + verification du role pour la route courante
 */

import { Navigate, useLocation } from 'react-router-dom';
import { Loader } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { hasAccess, getDefaultRouteForRole } from '../../lib/permissions';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();
  const path = location.pathname.replace(/\/$/, '') || '/';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin text-primary-500 mx-auto mb-4" />
          <p className="text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!hasAccess(user.role, path)) {
    return <Navigate to={getDefaultRouteForRole(user.role)} replace />;
  }

  return <>{children}</>;
}
