import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import type { BarIncident } from '../../pages/BarManagementPage';

type Filter = 'all' | 'open' | 'resolved';

interface Props {
  incidents: BarIncident[];
  onUpdate: () => void;
}

export default function IncidentList({ incidents, onUpdate }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const filtered = incidents.filter((i) => {
    if (filter === 'open') return !i.resolved;
    if (filter === 'resolved') return i.resolved;
    return true;
  });

  const handleToggle = async (incident: BarIncident) => {
    setTogglingId(incident.id);
    try {
      await api.patch(`/api/bar/incidents/${incident.id}/resolve`, {
        resolved: !incident.resolved,
      });
      onUpdate();
    } catch {
      toast.error('Erreur mise à jour');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2">
        {([
          ['all', 'Tous'],
          ['open', 'Non résolus'],
          ['resolved', 'Résolus'],
        ] as [Filter, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              filter === key
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <p className="text-center text-gray-400 py-8 text-sm">Aucun incident</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2 pr-4 font-medium w-8">Résolu</th>
                <th className="pb-2 pr-4 font-medium">Machine</th>
                <th className="pb-2 pr-4 font-medium">Raison</th>
                <th className="pb-2 pr-4 font-medium">Description</th>
                <th className="pb-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((incident) => (
                <tr
                  key={incident.id}
                  className={incident.resolved ? 'text-gray-400' : 'text-gray-900'}
                >
                  <td className="py-3 pr-4">
                    {togglingId === incident.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    ) : (
                      <input
                        type="checkbox"
                        checked={incident.resolved}
                        onChange={() => handleToggle(incident)}
                        className="rounded border-gray-300"
                      />
                    )}
                  </td>
                  <td className="py-3 pr-4 font-medium whitespace-nowrap">{incident.machine_name}</td>
                  <td className="py-3 pr-4">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      incident.resolved
                        ? 'bg-gray-100 text-gray-500'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {incident.reason}
                    </span>
                  </td>
                  <td className="py-3 pr-4 max-w-[200px] truncate text-gray-500">
                    {incident.description || '—'}
                  </td>
                  <td className="py-3 whitespace-nowrap text-gray-500">
                    {new Date(incident.created_at).toLocaleString('fr-FR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
