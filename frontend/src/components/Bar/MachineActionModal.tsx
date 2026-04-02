import { useState, useEffect, useCallback } from 'react';
import { X, Play, Loader2, AlertTriangle, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import type { MachineConfig, MachineType, BarIncident } from '../../pages/BarManagementPage';
import IncidentReportModal from './IncidentReportModal';

interface ActionDef {
  label: string;
  command: string;
  variant?: 'danger' | 'warning' | 'default';
}

const ACTIONS_BY_TYPE: Record<MachineType, ActionDef[]> = {
  table: [
    { label: 'Redémarrer', command: 'restart_pc', variant: 'danger' },
    { label: 'Relancer interface', command: 'restart_edge' },
    { label: 'Fermer le jeu', command: 'close_game' },
    { label: 'Régénérer le cache', command: 'clear_cache' },
    { label: 'Corriger écran dupliqué', command: 'reset_slave_screen', variant: 'warning' },
    { label: 'Corriger tactile/manettes', command: 'restart_usb', variant: 'warning' },
  ],
  borne: [
    { label: 'Redémarrer', command: 'restart_pc', variant: 'danger' },
    { label: 'Relancer le jeu', command: 'close_game' },
  ],
  bar: [
    { label: 'Redémarrer', command: 'restart_pc', variant: 'danger' },
    { label: 'Relancer interface', command: 'restart_edge' },
  ],
  tv: [
    { label: 'Redémarrer', command: 'restart_pc', variant: 'danger' },
    { label: 'Relancer interface', command: 'restart_edge' },
  ],
  projo: [
    { label: 'Redémarrer', command: 'restart_pc', variant: 'danger' },
    { label: 'Relancer interface', command: 'restart_edge' },
  ],
  salon: [
    { label: 'Redémarrer', command: 'restart_pc', variant: 'danger' },
    { label: 'Relancer interface', command: 'restart_edge' },
  ],
  all_tables: [
    { label: 'Redémarrer toutes', command: 'restart_pc', variant: 'danger' },
    { label: 'Relancer interface', command: 'restart_edge' },
    { label: 'Fermer le jeu', command: 'close_game' },
    { label: 'Régénérer le cache', command: 'clear_cache' },
    { label: 'Corriger écran dupliqué', command: 'reset_slave_screen', variant: 'warning' },
    { label: 'Corriger tactile/manettes', command: 'restart_usb', variant: 'warning' },
  ],
};

const VARIANT_CLASSES: Record<string, string> = {
  default: 'bg-gray-100 hover:bg-gray-200 text-gray-800',
  warning: 'bg-amber-100 hover:bg-amber-200 text-amber-800',
  danger: 'bg-red-100 hover:bg-red-200 text-red-800',
};

type Tab = 'actions' | 'incidents';

interface Props {
  machine: MachineConfig;
  agentConnected: boolean;
  onClose: () => void;
  onIncidentCreated: () => void;
}

export default function MachineActionModal({ machine, agentConnected, onClose, onIncidentCreated }: Props) {
  const [tab, setTab] = useState<Tab>('actions');
  const [executing, setExecuting] = useState<string | null>(null);
  const [machineIncidents, setMachineIncidents] = useState<BarIncident[]>([]);
  const [loadingIncidents, setLoadingIncidents] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  const targetName = machine.type === 'all_tables' ? 'TABLE' : machine.name;
  const actions = ACTIONS_BY_TYPE[machine.type] ?? [];
  const canReport = ['table', 'borne'].includes(machine.type);

  const loadMachineIncidents = useCallback(async () => {
    setLoadingIncidents(true);
    try {
      const { data } = await api.get<{ items: BarIncident[] }>(`/api/bar/incidents/${machine.name}`);
      setMachineIncidents(data.items);
    } catch {
      toast.error('Erreur chargement incidents');
    } finally {
      setLoadingIncidents(false);
    }
  }, [machine.name]);

  useEffect(() => {
    loadMachineIncidents();
  }, [loadMachineIncidents]);

  const handleExecute = async (action: ActionDef) => {
    if (action.variant === 'danger' && !confirm(`Confirmer : ${action.label} sur ${machine.label} ?`)) {
      return;
    }

    setExecuting(action.command);
    try {
      await api.post('/api/bar/execute-command', {
        command: action.command,
        targetName,
      });
      toast.success(`${action.label} — commande envoyée`);
    } catch (err: any) {
      const msg = err.response?.data?.message ?? 'Erreur lors de l\'exécution';
      toast.error(msg);
    } finally {
      setExecuting(null);
    }
  };

  const handleToggleResolved = async (incident: BarIncident) => {
    try {
      await api.patch(`/api/bar/incidents/${incident.id}/resolve`, {
        resolved: !incident.resolved,
      });
      loadMachineIncidents();
      onIncidentCreated();
    } catch {
      toast.error('Erreur mise à jour incident');
    }
  };

  const handleIncidentCreated = () => {
    setShowReportModal(false);
    loadMachineIncidents();
    onIncidentCreated();
  };

  const unresolvedCount = machineIncidents.filter((i) => !i.resolved).length;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">{machine.label}</h2>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b px-6">
            <button
              onClick={() => setTab('actions')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                tab === 'actions'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Actions
            </button>
            <button
              onClick={() => setTab('incidents')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
                tab === 'incidents'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Incidents
              {unresolvedCount > 0 && (
                <span className="bg-yellow-100 text-yellow-800 text-xs px-1.5 py-0.5 rounded-full">
                  {unresolvedCount}
                </span>
              )}
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {tab === 'actions' && (
              <div className="space-y-3">
                {!agentConnected && (
                  <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    Agent déconnecté — les actions ne fonctionneront pas
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {actions.map((action) => (
                    <button
                      key={action.command}
                      disabled={!agentConnected || executing !== null}
                      onClick={() => handleExecute(action)}
                      className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${
                        VARIANT_CLASSES[action.variant ?? 'default']
                      }`}
                    >
                      {executing === action.command ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                      {action.label}
                    </button>
                  ))}
                </div>

                {canReport && (
                  <button
                    onClick={() => setShowReportModal(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium bg-yellow-100 hover:bg-yellow-200 text-yellow-800 transition mt-4"
                  >
                    <Plus className="w-4 h-4" />
                    Rapporter un incident
                  </button>
                )}
              </div>
            )}

            {tab === 'incidents' && (
              <div className="space-y-3">
                {canReport && (
                  <button
                    onClick={() => setShowReportModal(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium bg-yellow-100 hover:bg-yellow-200 text-yellow-800 transition"
                  >
                    <Plus className="w-4 h-4" />
                    Rapporter un incident
                  </button>
                )}

                {loadingIncidents ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : machineIncidents.length === 0 ? (
                  <p className="text-center text-gray-400 py-8 text-sm">Aucun incident signalé</p>
                ) : (
                  <div className="space-y-2">
                    {machineIncidents.map((incident) => (
                      <div
                        key={incident.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${
                          incident.resolved ? 'bg-gray-50 border-gray-200' : 'bg-yellow-50 border-yellow-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={incident.resolved}
                          onChange={() => handleToggleResolved(incident)}
                          className="mt-0.5 rounded border-gray-300"
                        />
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium ${incident.resolved ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                            {incident.reason}
                          </p>
                          {incident.description && (
                            <p className="text-gray-500 mt-0.5 text-xs">{incident.description}</p>
                          )}
                          <p className="text-gray-400 mt-1 text-xs">
                            {new Date(incident.created_at).toLocaleString('fr-FR')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showReportModal && (
        <IncidentReportModal
          machine={machine}
          onClose={() => setShowReportModal(false)}
          onCreated={handleIncidentCreated}
        />
      )}
    </>
  );
}
