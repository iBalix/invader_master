/**
 * Page Tables tactiles > Bornes (devices).
 *
 * Liste des tables tactiles enregistrees (table_devices).
 * Une borne est creee automatiquement au premier heartbeat (cf. /public/tables/heartbeat).
 * Ici on peut :
 *   - Editer le display_name et l'inactivity_timeout
 *   - Activer/desactiver une borne
 *   - Forcer un reload (Pusher event "reload" sur le channel TABLEXX-Y)
 *   - Supprimer une borne
 */

import { useEffect, useState, useCallback } from 'react';
import { Pencil, Trash2, RefreshCw, Loader2, Wifi, WifiOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';

interface Device {
  id: string;
  hostname: string;
  table_number: string;
  role: 'master' | 'slave';
  display_name: string | null;
  inactivity_timeout_ms: number;
  active: boolean;
  last_seen_at: string | null;
  created_at?: string;
}

const ONLINE_THRESHOLD_MS = 60_000;

function isOnline(d: Device): boolean {
  if (!d.last_seen_at) return false;
  return Date.now() - new Date(d.last_seen_at).getTime() < ONLINE_THRESHOLD_MS;
}

function formatLastSeen(iso: string | null): string {
  if (!iso) return 'jamais';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `il y a ${Math.floor(diff / 1000)}s`;
  if (diff < 3_600_000) return `il y a ${Math.floor(diff / 60_000)}min`;
  if (diff < 86_400_000) return `il y a ${Math.floor(diff / 3_600_000)}h`;
  return new Date(iso).toLocaleDateString('fr-FR');
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Device | null>(null);
  const [reloading, setReloading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/table-devices');
      setDevices(data.items ?? []);
    } catch {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleToggleActive(d: Device) {
    try {
      await api.put(`/api/table-devices/${d.id}`, { active: !d.active });
      load();
    } catch {
      toast.error('Erreur');
    }
  }

  async function handleDelete(d: Device) {
    if (!confirm(`Supprimer ${d.hostname} ?`)) return;
    try {
      await api.delete(`/api/table-devices/${d.id}`);
      toast.success('Supprime');
      load();
    } catch {
      toast.error('Erreur');
    }
  }

  async function handleReload(d: Device) {
    setReloading(d.id);
    try {
      await api.post(`/api/table-devices/${d.hostname}/reload`);
      toast.success(`Reload envoye a ${d.hostname}`);
    } catch {
      toast.error('Erreur reload');
    } finally {
      setReloading(null);
    }
  }

  async function handleSave(d: Device, patch: Partial<Device>) {
    try {
      await api.put(`/api/table-devices/${d.id}`, patch);
      toast.success('Enregistre');
      setEditing(null);
      load();
    } catch {
      toast.error('Erreur enregistrement');
    }
  }

  const grouped = devices.reduce<Record<string, Device[]>>((acc, d) => {
    (acc[d.table_number] ??= []).push(d);
    return acc;
  }, {});
  const tableNumbers = Object.keys(grouped).sort();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Bornes tactiles</h1>
          <p className="text-sm text-gray-500 mt-1">
            Tables enregistrees (TABLE01-1 = master, TABLE01-2 = slave). Auto-detectees
            au premier heartbeat.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
        >
          <RefreshCw className="w-4 h-4" /> Actualiser
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">Chargement...</p>
      ) : devices.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <WifiOff className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Aucune borne detectee</p>
          <p className="text-xs text-gray-400 mt-2">
            Une borne s'enregistre automatiquement quand elle envoie son premier
            heartbeat (URL: /table?hostname=TABLE01-1)
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {tableNumbers.map((num) => (
            <div key={num} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">Table {num}</h2>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-2">Statut</th>
                    <th className="px-4 py-2">Hostname</th>
                    <th className="px-4 py-2">Role</th>
                    <th className="px-4 py-2">Nom affiche</th>
                    <th className="px-4 py-2">Inactivite</th>
                    <th className="px-4 py-2">Vu</th>
                    <th className="px-4 py-2 text-center">Actif</th>
                    <th className="px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {grouped[num]
                    .sort((a, b) => a.role.localeCompare(b.role))
                    .map((d) => (
                      <tr key={d.id} className={`hover:bg-gray-50 ${!d.active ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3">
                          {isOnline(d) ? (
                            <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                              <Wifi className="w-3 h-3" /> en ligne
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-gray-400">
                              <WifiOff className="w-3 h-3" /> hors ligne
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-sm">{d.hostname}</td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-semibold ${
                              d.role === 'master'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {d.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {d.display_name ?? <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {Math.round(d.inactivity_timeout_ms / 1000)}s
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{formatLastSeen(d.last_seen_at)}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleToggleActive(d)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                              d.active ? 'bg-green-500' : 'bg-gray-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                                d.active ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleReload(d)}
                              disabled={reloading === d.id}
                              className="p-1.5 text-gray-400 hover:text-blue-500 disabled:opacity-50"
                              title="Forcer reload"
                            >
                              {reloading === d.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <RefreshCw className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              onClick={() => setEditing(d)}
                              className="p-1.5 text-gray-400 hover:text-primary-500"
                              title="Modifier"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(d)}
                              className="p-1.5 text-gray-400 hover:text-red-500"
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <DeviceEditModal
          device={editing}
          onSave={(patch) => handleSave(editing, patch)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function DeviceEditModal({
  device,
  onSave,
  onClose,
}: {
  device: Device;
  onSave: (patch: Partial<Device>) => Promise<void>;
  onClose: () => void;
}) {
  const [displayName, setDisplayName] = useState(device.display_name ?? '');
  const [timeoutS, setTimeoutS] = useState(Math.round(device.inactivity_timeout_ms / 1000));
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        display_name: displayName.trim() || null,
        inactivity_timeout_ms: timeoutS * 1000,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-5 border-b">
          <h2 className="text-lg font-bold">Modifier {device.hostname}</h2>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom affiche</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={`Table ${device.table_number} - ${device.role === 'master' ? 'principal' : 'second'}`}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Inactivite avant ecran de veille (secondes)
            </label>
            <input
              type="number"
              min={10}
              max={600}
              value={timeoutS}
              onChange={(e) => setTimeoutS(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  );
}
