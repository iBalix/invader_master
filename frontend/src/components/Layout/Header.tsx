/**
 * Header - Barre supérieure avec breadcrumb et déconnexion
 */

import { useNavigate, useLocation, Link } from 'react-router-dom';
import { LogOut, User, Home, ChevronRight } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const PATH_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/users': 'Gestion des users',
  '/contenus/quiz': 'Quiz',
  '/contenus/quiz/new': 'Nouveau quiz',
  '/contenus/carte': 'Carte',
  '/contenus/carte/category/new': 'Nouvelle catégorie',
  '/contenus/jeux': 'Jeux',
  '/contenus/jeux/game/new': 'Nouveau jeu',
  '/contenus/medias': 'Support médias',
};

interface Crumb {
  label: string;
  path?: string;
}

function buildBreadcrumbs(pathname: string): Crumb[] {
  const path = pathname.replace(/\/$/, '') || '/';
  if (path === '/') return [{ label: 'Dashboard' }];

  const crumbs: Crumb[] = [];
  const segments = path.split('/').filter(Boolean);

  let accumulated = '';
  for (let i = 0; i < segments.length; i++) {
    accumulated += '/' + segments[i];
    const isLast = i === segments.length - 1;
    const label = PATH_LABELS[accumulated];

    if (label) {
      crumbs.push(isLast ? { label } : { label, path: accumulated });
    } else if (isLast) {
      const isUuid = /^[0-9a-f-]{36}$/i.test(segments[i]);
      if (isUuid) {
        crumbs.push({ label: 'Édition' });
      } else {
        crumbs.push({ label: segments[i] });
      }
    }
  }

  return crumbs;
}

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const path = location.pathname.replace(/\/$/, '') || '/';
  const breadcrumbs = buildBreadcrumbs(location.pathname);
  const isOnDashboard = path === '/';

  return (
    <header className="bg-white border-b border-gray-200 h-16 fixed top-0 right-0 left-64 z-10 shadow-sm">
      <div className="h-full px-6 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
              {crumb.path ? (
                <Link to={crumb.path} className="text-sm text-gray-500 hover:text-primary-600 transition">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-sm font-semibold text-gray-900">{crumb.label}</span>
              )}
            </span>
          ))}
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
