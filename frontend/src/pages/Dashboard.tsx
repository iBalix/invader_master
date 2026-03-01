/**
 * Page d'accueil back-office
 */

import { LayoutDashboard } from 'lucide-react';

export default function Dashboard() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Dashboard</h1>
      <p className="text-gray-600 mb-6">Bienvenue sur le back-office Invader Master.</p>
      <div className="bg-white rounded-lg border border-gray-200 p-6 flex items-center gap-4">
        <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
          <LayoutDashboard className="w-6 h-6 text-primary-600" />
        </div>
        <div>
          <h2 className="font-medium text-gray-900">Espace de travail</h2>
          <p className="text-sm text-gray-500">Utilisez le menu à gauche pour accéder aux différentes sections.</p>
        </div>
      </div>
    </div>
  );
}
