/**
 * Header - Barre supérieure avec breadcrumb et déconnexion
 */

import { useNavigate, useLocation } from 'react-router-dom';
import { LogOut, User, Home } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const PATH_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/contenus': 'Contenus',
  '/users': 'Gestion des users',
};

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const path = location.pathname.replace(/\/$/, '') || '/';
  const breadcrumbLabel = PATH_LABELS[path] ?? (path.slice(1) || 'Dashboard');
  const isOnDashboard = path === '/';

  return (
    <header className="bg-white border-b border-gray-200 h-16 fixed top-0 right-0 left-64 z-10 shadow-sm">
      <div className="h-full px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-gray-900">{breadcrumbLabel}</span>
        </div>

        <div className="flex items-center gap-4">
          {!isOnDashboard && (
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex items-center gap-2 px-4 py-2 text-sm text-primary-600 hover:bg-primary-50 rounded-lg transition"
            >
              <Home className="w-4 h-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </button>
          )}

          <div className="flex items-center gap-2 text-sm">
            <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-primary-600" />
            </div>
            <span className="text-gray-700 font-medium hidden sm:inline">{user?.email}</span>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </div>
      </div>
    </header>
  );
}
