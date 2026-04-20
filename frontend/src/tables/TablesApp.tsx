/**
 * Sous-application "Tables tactiles".
 *
 * Montee dans App.tsx sous /table/* SANS AuthProvider ni ProtectedRoute :
 * les tables ne sont pas connectees a un compte utilisateur, elles
 * s'identifient via leur hostname (X-Hostname header).
 *
 * Routes :
 *   /table              -> redirige vers /table/screensaver
 *   /table/setup        -> ecran de setup hostname (si jamais on y accede manuellement)
 *   /table/screensaver  -> ecran de veille
 *   /table/home         -> menu principal
 *   /table/menu         -> carte (commande)
 *   /table/games        -> liste jeux
 *
 * Si aucun hostname n'est connu (URL ni localStorage), on force /table/setup.
 */

import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import TableLayout from './components/layout/TableLayout';
import SetupPage from './pages/SetupPage';
import ScreensaverPage from './pages/ScreensaverPage';
import HomePage from './pages/HomePage';
import MenuPage from './pages/MenuPage';
import GamesPage from './pages/GamesPage';
import InGamePage from './pages/InGamePage';
import { useHostname } from './hooks/useHostname';

function HostnameGuard({ children }: { children: React.ReactNode }) {
  const identity = useHostname();
  const location = useLocation();
  if (!identity && !location.pathname.startsWith('/table/setup')) {
    return <Navigate to="/table/setup" replace />;
  }
  return <>{children}</>;
}

export default function TablesApp() {
  return (
    <Routes>
      <Route path="setup" element={<SetupPage />} />

      <Route
        element={
          <HostnameGuard>
            <TableLayout />
          </HostnameGuard>
        }
      >
        <Route index element={<Navigate to="/table/screensaver" replace />} />
        <Route path="screensaver" element={<ScreensaverPage />} />
        <Route path="home" element={<HomePage />} />
        <Route path="menu" element={<MenuPage />} />
        <Route path="games" element={<GamesPage />} />
        <Route path="in-game" element={<InGamePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/table/screensaver" replace />} />
    </Routes>
  );
}
