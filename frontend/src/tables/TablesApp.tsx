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
 *   /table/play         -> partie quiz/battle jouee depuis la borne
 *
 * Si aucun hostname n'est connu (URL ni localStorage), on force /table/setup.
 */

import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import TableLayout from './components/layout/TableLayout';
import SetupPage from './pages/SetupPage';
import ScreensaverPage from './pages/ScreensaverPage';
import HomePage from './pages/HomePage';
import MenuPage from './pages/MenuPage';
import GamesPage from './pages/GamesPage';
import InGamePage from './pages/InGamePage';
import TablePlayPage from './pages/TablePlayPage';
import ChessLobbyPage from './games/chess/pages/ChessLobbyPage';
import ChessGamePage from './games/chess/pages/ChessGamePage';
import BlackjackLobbyPage from './games/blackjack/pages/BlackjackLobbyPage';
import BlackjackGamePage from './games/blackjack/pages/BlackjackGamePage';
import { useHostname } from './hooks/useHostname';

function HostnameGuard({ children }: { children: React.ReactNode }) {
  const identity = useHostname();
  const location = useLocation();
  if (!identity && !location.pathname.startsWith('/table/setup')) {
    return <Navigate to="/table/setup" replace />;
  }
  return <>{children}</>;
}

/**
 * Marque le document en mode kiosque tant qu'on est sous /table/*.
 *
 * Sur dalle tactile, un appui maintenu puis glisse faisait bouger tout l'ecran
 * et decouvrait une bande blanche sur les bords : c'est le rebond elastique du
 * navigateur, plus le fait que le document lui-meme pouvait defiler de quelques
 * pixels (`w-screen` valant 100vw, barre de defilement comprise, il suffit d'une
 * barre verticale pour creer un debordement horizontal). Les regles associees
 * dans index.css coupent les deux, et peignent le fond du document dans la
 * teinte du theme pour qu'aucune bande claire ne puisse apparaitre.
 *
 * Pose sur <html> et non en dur dans le CSS global : le back-office garde son
 * defilement normal, seules les bornes sont verrouillees.
 */
function useKioskDocument(): void {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('tables-kiosk');
    return () => root.classList.remove('tables-kiosk');
  }, []);
}

export default function TablesApp() {
  useKioskDocument();
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
        <Route path="games/chess" element={<ChessLobbyPage />} />
        <Route path="games/chess/:sessionId" element={<ChessGamePage />} />
        <Route path="games/blackjack" element={<BlackjackLobbyPage />} />
        <Route path="games/blackjack/:sessionId" element={<BlackjackGamePage />} />
        <Route path="in-game" element={<InGamePage />} />
        <Route path="play" element={<TablePlayPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/table/screensaver" replace />} />
    </Routes>
  );
}
