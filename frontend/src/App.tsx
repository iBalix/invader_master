/**
 * Routeur principal
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { PermissionsProvider } from './hooks/usePermissions';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import MainLayout from './components/Layout/MainLayout';
import LoginPage from './components/Auth/LoginPage';
import Dashboard from './pages/Dashboard';
import QuizListPage from './pages/QuizListPage';
import QuizFormPage from './pages/QuizFormPage';
import CarteListPage from './pages/CarteListPage';
import CategoryFormPage from './pages/CategoryFormPage';
import GamesListPage from './pages/GamesListPage';
import GameFormPage from './pages/GameFormPage';
import ScreensConfigPage from './pages/ScreensConfigPage';
import EventsPage from './pages/EventsPage';
import CouponsPage from './pages/TablesTactiles/CouponsPage';
import OrdersPage from './pages/TablesTactiles/OrdersPage';
import TranslationsPage from './pages/TranslationsPage';
import UserManagementPage from './pages/UserManagementPage';
import ImportFinancesPage from './pages/ImportFinancesPage';
import BattleQuestionsPage from './pages/BattleQuestionsPage';
import ComingSoon from './pages/ComingSoon';
import BarManagementPage from './pages/BarManagementPage';
import CashManagementPage from './pages/CashManagementPage';
import TablesApp from './tables/TablesApp';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/*
          Sous-app "Tables tactiles" : routes publiques /table/*,
          PAS d'AuthProvider ni de ProtectedRoute (les bornes
          s'identifient via leur hostname et non via un compte utilisateur).
        */}
        <Route path="/table/*" element={<TablesApp />} />

        {/* Back-office : authentification + permissions requises */}
        <Route
          path="/*"
          element={
            <AuthProvider>
              <PermissionsProvider>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />

                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <MainLayout />
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={<Dashboard />} />
                    <Route path="gestion-bar" element={<BarManagementPage />} />
                    <Route path="contenus/quiz" element={<QuizListPage />} />
                    <Route path="contenus/quiz/new" element={<QuizFormPage />} />
                    <Route path="contenus/quiz/:id" element={<QuizFormPage />} />
                    <Route path="contenus/carte" element={<CarteListPage />} />
                    <Route path="contenus/carte/category/new" element={<CategoryFormPage />} />
                    <Route path="contenus/carte/category/:id" element={<CategoryFormPage />} />
                    <Route path="contenus/jeux" element={<GamesListPage />} />
                    <Route path="contenus/jeux/game/new" element={<GameFormPage />} />
                    <Route path="contenus/jeux/game/:id" element={<GameFormPage />} />
                    <Route path="contenus/config-ecrans" element={<ScreensConfigPage />} />
                    <Route path="contenus/medias" element={<Navigate to="/contenus/config-ecrans" replace />} />
                    <Route path="contenus/evenements" element={<EventsPage />} />
                    <Route path="contenus/traductions" element={<TranslationsPage />} />
                    <Route path="utilitaires/import-finances" element={<ImportFinancesPage />} />
                    <Route path="utilitaires/comptabilite" element={<CashManagementPage />} />
                    <Route path="evenements/battle-questions" element={<BattleQuestionsPage />} />
                    <Route path="tables-tactiles/coupons" element={<CouponsPage />} />
                    <Route path="tables-tactiles/orders" element={<OrdersPage />} />
                    <Route path="users" element={<UserManagementPage />} />
                    <Route path="bientot" element={<ComingSoon />} />
                  </Route>

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </PermissionsProvider>
            </AuthProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
