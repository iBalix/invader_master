/**
 * Routeur principal
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import MainLayout from './components/Layout/MainLayout';
import LoginPage from './components/Auth/LoginPage';
import Dashboard from './pages/Dashboard';
import ContenusPage from './pages/ContenusPage';
import UserManagementPage from './pages/UserManagementPage';
import ComingSoon from './pages/ComingSoon';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
            <Route path="contenus" element={<ContenusPage />} />
            <Route path="users" element={<UserManagementPage />} />
            <Route path="bientot" element={<ComingSoon />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
