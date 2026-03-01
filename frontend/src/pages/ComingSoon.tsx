/**
 * Page générique "Bientôt"
 */

import { Clock } from 'lucide-react';

export default function ComingSoon() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh]">
      <div className="inline-flex items-center justify-center w-20 h-20 bg-amber-100 rounded-full mb-6">
        <Clock className="w-10 h-10 text-amber-600" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Bientôt disponible</h1>
      <p className="text-gray-500 text-center max-w-md">
        Cette fonctionnalité est en cours de développement. Revenez plus tard.
      </p>
    </div>
  );
}
