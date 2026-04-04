import { useState, useEffect, useCallback } from 'react';
import { X, Play, Loader2, AlertTriangle, Plus, Pencil, Save, Power, RefreshCw, XCircle, RotateCcw, Monitor, Gamepad2, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import type { MachineConfig, MachineType, MachineLabels, BarIncident } from '../../pages/BarManagementPage';
import { useAuth } from '../../hooks/useAuth';
import IncidentReportModal from './IncidentReportModal';

interface ActionDef {
  label: string;
  command: string;
  variant?: 'danger' | 'warning' | 'default';
}

const BORNE_GAMES = [
  { label: 'MarioKart 64', value: 'MarioKart64.n64;parallel_n64_libretro.dll' },
  { label: 'Mario Tennis', value: 'MarioTennis.n64;mupen64plus_next_libretro.dll' },
  { label: 'Super Smash Bros', value: 'SuperSmashBros.n64;mupen64plus_next_libretro.dll' },
  { label: 'Street Fighter II', value: 'StreetFighterIITurbo.sfc;mesen-s_libretro.dll' },
  { label: 'Star Wars Racer', value: 'StarWarsRacer.n64;mupen64plus_next_libretro.dll' },
  { label: 'Streets of Rage 2', value: 'StreetsofRage.md;genesis_plus_gx_libretro.dll' },
  { label: 'Sonic The Hedgehog 2', value: 'SonicTheHedgehog2.md;genesis_plus_gx_libretro.dll' },
  { label: 'Windjammers', value: 'wjammers.zip;fbneo_libretro.dll' },
  { label: 'Crash Team Racing', value: 'CrashTeamRacing/CrashTeamRacing.cue;swanstation_libretro.dll' },
  { label: 'Muggle (Manoir)', value: 'MUGGLE_MANOIR' },
];

const PROJO_MODES = [
  { label: 'Invader', value: '' },
  { label: 'Quizz', value: 'http://quizz.invader.bar?type=projecteur' },
  { label: 'Battle Royale', value: 'http://quizz.invader.bar/battle.php?type=projecteur&hostname=PROJO' },
  { label: 'TV', value: 'http://localhost/tv.php?type=projecteur&hostname=PROJO' },
  { label: 'Stand Up', value: 'http://localhost/standup.php?type=projecteur&hostname=PROJO' },
];

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
  all_tables: [
    { label: 'Redémarrer toutes', command: 'restart_pc', variant: 'danger' },
    { label: 'Relancer interface', command: 'restart_edge' },
    { label: 'Fermer le jeu', command: 'close_game' },
    { label: 'Régénérer le cache', command: 'clear_cache' },
    { label: 'Corriger écran dupliqué', command: 'reset_slave_screen', variant: 'warning' },
    { label: 'Corriger tactile/manettes', command: 'restart_usb', variant: 'warning' },
  ],
};

const COMMAND_ICONS: Record<string, LucideIcon> = {
  restart_pc: Power,
  restart_edge: RefreshCw,
  close_game: XCircle,
  clear_cache: RotateCcw,
  reset_slave_screen: Monitor,
  restart_usb: Gamepad2,
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
  labels?: MachineLabels;
  pingStatus?: Record<string, boolean>;
  onClose: () => void;
  onIncidentCreated: () => void;
  onLabelsUpdated: () => void;
}

export default function MachineActionModal({ machine, agentConnected, labels, pingStatus, onClose, onIncidentCreated, onLabelsUpdated }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState<Tab>('actions');
  const [executing, setExecuting] = useState<string | null>(null);
  const [machineIncidents, setMachineIncidents] = useState<BarIncident[]>([]);
  const [loadingIncidents, setLoadingIncidents] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedGame, setSelectedGame] = useState(BORNE_GAMES[0].value);
  const [selectedProjoMode, setSelectedProjoMode] = useState(PROJO_MODES[0].value);
  const [editingLabels, setEditingLabels] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editTechName, setEditTechName] = useState('');
  const [savingLabels, setSavingLabels] = useState(false);

  const targetName = machine.type === 'all_tables' ? 'TABLE' : machine.name;
  const actions = ACTIONS_BY_TYPE[machine.type] ?? [];
  const canReport = ['table', 'borne', 'projo'].includes(machine.type);

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

  const handleChangeGame = async () => {
    let gameName = selectedGame;
    if (gameName === 'MUGGLE_MANOIR' && machine.name.startsWith('BORNE')) {
      const borneNum = parseInt(machine.name.replace('BORNE', ''), 10);
      gameName = `http://quizz.invader.bar/games/flappybird_manoir/index.html?version=${borneNum}`;
    }

    setExecuting('change_game');
    try {
      await api.post('/api/bar/execute-command', {
        command: 'change_game',
        targetName,
        gameName,
      });
      toast.success('Changement de jeu — commande envoyée');
    } catch (err: any) {
      const msg = err.response?.data?.message ?? 'Erreur lors de l\'exécution';
      toast.error(msg);
    } finally {
      setExecuting(null);
    }
  };

  const handleChangeProjoMode = async () => {
    setExecuting('projo_mode');
    try {
      await api.post('/api/bar/execute-command', {
        command: 'url_edge_server',
        targetName: 'PROJO',
        gameName: selectedProjoMode,
      });
      await api.post('/api/bar/execute-command', {
        command: 'restart_edge',
        targetName: 'PROJO',
      });
      toast.success('Mode d\'affichage modifié');
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

  const openLabelEdit = () => {
    setEditDisplayName(labels?.display_name || machine.label);
    setEditTechName(labels?.technical_name || '');
    setEditingLabels(true);
  };

  const saveLabels = async () => {
    setSavingLabels(true);
    try {
      await api.put(`/api/bar/machine-labels/${machine.name}`, {
        display_name: editDisplayName,
        technical_name: editTechName,
      });
      toast.success('Noms mis à jour');
      setEditingLabels(false);
      onLabelsUpdated();
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSavingLabels(false);
    }
  };

  const unresolvedCount = machineIncidents.filter((i) => !i.resolved).length;

  const getPingWarnings = (): string[] => {
    if (!pingStatus || Object.keys(pingStatus).length === 0 || machine.type === 'all_tables') return [];
    const warnings: string[] = [];
    if (machine.type === 'table') {
      const num = machine.name.replace('TABLE', '');
      if (pingStatus[`TABLE${num}-1`] === false) warnings.push('côté mur');
      if (pingStatus[`TABLE${num}-2`] === false) warnings.push('côté intérieur');
    } else {
      if (pingStatus[machine.name] === false) warnings.push('machine injoignable');
    }
    return warnings;
  };
  const pingWarnings = getPingWarnings();

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <div className="flex items-center gap-2 min-w-0">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 truncate">
                  {labels?.display_name || machine.label}
                </h2>
                {labels?.technical_name && (
                  <p className="text-xs text-gray-400">{labels.technical_name}</p>
                )}
              </div>
              {isAdmin && !editingLabels && (
                <button
                  onClick={openLabelEdit}
                  className="p-1.5 text-gray-400 hover:text-primary-500 hover:bg-gray-100 rounded-lg transition flex-shrink-0"
                  title="Renommer"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
            </div>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition flex-shrink-0">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {editingLabels && (
            <div className="px-6 py-3 border-b bg-gray-50 space-y-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nom d'affichage</label>
                <input
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                  placeholder={machine.label}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nom technique</label>
                <input
                  type="text"
                  value={editTechName}
                  onChange={(e) => setEditTechName(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                  placeholder={machine.name}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setEditingLabels(false)}
                  className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-100 transition"
                >
                  Annuler
                </button>
                <button
                  onClick={saveLabels}
                  disabled={savingLabels}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition disabled:opacity-50"
                >
                  {savingLabels ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Enregistrer
                </button>
              </div>
            </div>
          )}

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

                {pingWarnings.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">
                    <Zap className="w-4 h-4 flex-shrink-0" />
                    <span>
                      {machine.type === 'table'
                        ? `Ne répond pas au ping : ${pingWarnings.join(', ')}`
                        : 'Ne répond pas au ping'}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {actions.map((action) => {
                    const Icon = COMMAND_ICONS[action.command] ?? Play;
                    return (
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
                          <Icon className="w-4 h-4" />
                        )}
                        {action.label}
                      </button>
                    );
                  })}
                </div>

                {machine.type === 'borne' && (
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t">
                    <select
                      value={selectedGame}
                      onChange={(e) => setSelectedGame(e.target.value)}
                      disabled={!agentConnected || executing !== null}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm bg-white disabled:opacity-50"
                    >
                      {BORNE_GAMES.map((game) => (
                        <option key={game.value} value={game.value}>
                          {game.label}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={!agentConnected || executing !== null}
                      onClick={handleChangeGame}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-green-100 hover:bg-green-200 text-green-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {executing === 'change_game' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                      Changer le jeu
                    </button>
                  </div>
                )}

                {machine.type === 'projo' && (
                  <div className="mt-4 pt-4 border-t">
                    <label className="block text-xs font-medium text-gray-500 mb-2">Mode d'affichage</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedProjoMode}
                        onChange={(e) => setSelectedProjoMode(e.target.value)}
                        disabled={!agentConnected || executing !== null}
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm bg-white disabled:opacity-50"
                      >
                        {PROJO_MODES.map((mode) => (
                          <option key={mode.label} value={mode.value}>
                            {mode.label}
                          </option>
                        ))}
                      </select>
                      <button
                        disabled={!agentConnected || executing !== null}
                        onClick={handleChangeProjoMode}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-green-100 hover:bg-green-200 text-green-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {executing === 'projo_mode' ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                        Appliquer
                      </button>
                    </div>
                  </div>
                )}

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
                {pingWarnings.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">
                    <Zap className="w-4 h-4 flex-shrink-0" />
                    <span>
                      {machine.type === 'table'
                        ? `Ne répond pas au ping : ${pingWarnings.join(', ')}`
                        : 'Ne répond pas au ping'}
                    </span>
                  </div>
                )}
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
