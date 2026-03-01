/**
 * Page Contenus - placeholder (accessible à tous les rôles)
 */

import { FileText } from 'lucide-react';

export default function ContenusPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Contenus</h1>
      <p className="text-gray-600 mb-6">Gestion des contenus affichés sur les dispositifs.</p>
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
          <FileText className="w-8 h-8 text-gray-500" />
        </div>
        <h2 className="text-lg font-medium text-gray-900 mb-2">À venir</h2>
        <p className="text-gray-500">Cette section est en cours de développement.</p>
      </div>
    </div>
  );
}
