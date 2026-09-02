import { useState, useEffect, useCallback } from 'react';
import { X, Play, Loader2, AlertTriangle, Plus, Pencil, Save, Power, RefreshCw, XCircle, RotateCcw, Monitor, Gamepad2, Zap, FlaskConical } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import type { MachineConfig, MachineType, MachineLabels, BarIncident, ActionLog } from '../../pages/BarManagementPage';
import { useAuth } from '../../hooks/useAuth';
import IncidentReportModal from './IncidentReportModal';

interface ActionDef {
  label: string;
  command: string;
  id?: string;
  variant?: 'danger' | 'warning' | 'default';
  logged?: boolean;
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

/**
 * TEMPORAIRE — bascule d'une table entre l'ancienne interface (site PHP servi
 * en local par le poste) et la nouvelle (invader_master, sur Railway).
 *
 * A retirer quand toutes les tables auront bascule pour de bon, cote lanceur
 * kiosque sur les PC. En attendant, ca permet de basculer une table dans les
 * deux sens sans toucher aux autres.
 *
 * Le `?hostname=` est indispensable : la nouvelle interface est sur un autre
 * domaine que l'ancien site, son localStorage est donc vide au premier
 * affichage et elle ne saurait pas quelle table elle est. Elle memorise
 * ensuite la valeur, mais on la repasse a chaque bascule pour rester
 * deterministe.
 */
const V2_BASE_URL = 'https://invadermaster-frontend-production.up.railway.app/table';

/**
 * L'ancienne interface est servie par le poste lui-meme, et la seconde dalle a
 * son propre type d'affichage : une URL par ecran, indexee par son suffixe.
 * Ce sont les valeurs que les postes utilisent au demarrage (kioskURL.txt).
 */
const V1_URL_BY_SCREEN: Record<string, string> = {
  '-1': 'http://localhost?type=table',
  '-2': 'http://localhost?type=table_slave',
};

/**
 * URL de l'ecran projo de la nouvelle interface.
 *
 * Une seule entree pour le quiz ET le battle, contrairement a la V1 qui exigeait
 * deux URLs distinctes : `/screen/:hostname` lit la session en cours et affiche
 * ce qu'il faut, y compris un ecran d'attente quand rien ne tourne. Le hostname
 * compte, ScreenApp s'en sert pour distinguer un projecteur d'une TV de bar
 * (tout ce qui commence par BAR est une TV).
 */
const V2_ORIGIN = 'https://invadermaster-frontend-production.up.railway.app';
const V2_PROJO_URL = `${V2_ORIGIN}/screen/PROJO`;
const V2_BAR_URL = `${V2_ORIGIN}/screen/BAR`;
/**
 * Retour a l'ecran de demarrage du poste (kioskURL.txt), resolu par le script
 * SRV1. Une chaine vide ne marchait pas : l'agent ne la transmettait pas, et
 * le lanceur gardait la derniere URL forcee jusqu'au reboot du PC.
 */
const DEFAULT_SCREEN = 'DEFAULT';

interface ScreenMode {
  label: string;
  value: string;
}

const PROJO_MODES: ScreenMode[] = [
  { label: 'Invader', value: DEFAULT_SCREEN },
  { label: 'Quizz', value: 'http://quizz.invader.bar?type=projecteur' },
  { label: 'Battle Royale', value: 'http://quizz.invader.bar/battle.php?type=projecteur&hostname=PROJO' },
  { label: 'TV', value: 'http://localhost/tv.php?type=projecteur&hostname=PROJO' },
  { label: 'Stand Up', value: 'http://localhost/standup.php?type=projecteur&hostname=PROJO' },
  { label: 'V2 · Quiz + Battle (Invader Master)', value: V2_PROJO_URL },
];

/** TV du bar (BAR01 / BAR02) : ecran par defaut ou page permanente du quiz */
const BAR_MODES: ScreenMode[] = [
  { label: 'Invader', value: DEFAULT_SCREEN },
  { label: 'V2 · Écran bar quiz (Invader Master)', value: V2_BAR_URL },
];

const SCREEN_MODES_BY_TYPE: Partial<Record<MachineType, ScreenMode[]>> = {
  projo: PROJO_MODES,
  bar: BAR_MODES,
};

const ACTIONS_BY_TYPE: Record<MachineType, ActionDef[]> = {
  table: [
    { label: 'Redémarrer', command: 'restart_pc', variant: 'danger', logged: true },
    { label: 'Relancer interface', command: 'restart_edge' },
    { label: 'Fermer le jeu', command: 'close_game' },
    { label: 'Régénérer le cache', command: 'clear_cache' },
    { label: 'Corriger écran dupliqué', command: 'reset_slave_screen', variant: 'warning', logged: true },
    { label: 'Corriger écran tactile', command: 'restart_usb', id: 'restart_usb_tactile', variant: 'warning', logged: true },
    { label: 'Corriger manettes', command: 'restart_usb', id: 'restart_usb_manettes', variant: 'warning', logged: true },
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
    { label: 'Redémarrer toutes', command: 'restart_pc', variant: 'danger', logged: true },
    { label: 'Relancer interface', command: 'restart_edge' },
    { label: 'Fermer le jeu', command: 'close_game' },
    { label: 'Régénérer le cache', command: 'clear_cache' },
    { label: 'Corriger écran dupliqué', command: 'reset_slave_screen', variant: 'warning', logged: true },
    { label: 'Corriger écran tactile', command: 'restart_usb', id: 'restart_usb_tactile', variant: 'warning', logged: true },
    { label: 'Corriger manettes', command: 'restart_usb', id: 'restart_usb_manettes', variant: 'warning', logged: true },
  ],
};

const COMMAND_ICONS: Record<string, LucideIcon> = {
  restart_pc: Power,
  restart_edge: RefreshCw,
  close_game: XCircle,
  clear_cache: RotateCcw,
  reset_slave_screen: Monitor,
  restart_usb: Gamepad2,
  restart_usb_tactile: Monitor,
  restart_usb_manettes: Gamepad2,
};

const VARIANT_CLASSES: Record<string, string> = {
  default: 'bg-gray-100 hover:bg-gray-200 text-gray-800',
  warning: 'bg-amber-100 hover:bg-amber-200 text-amber-800',
  danger: 'bg-red-100 hover:bg-red-200 text-red-800',
};

type Tab = 'actions' | 'incidents' | 'historique';

interface Props {
  machine: MachineConfig;
  /**
   * Noms des tables du bar, pour la bascule groupee de la fiche "ALL TABLES".
   * La liste vient de la page plutot que d'etre redefinie ici : une table
   * ajoutee au plan doit basculer avec les autres sans qu'on y pense.
   */
  tableNames?: string[];
  agentConnected: boolean;
  labels?: MachineLabels;
  pingStatus?: Record<string, boolean>;
  onClose: () => void;
  onIncidentCreated: () => void;
  onLabelsUpdated: () => void;
}

export default function MachineActionModal({ machine, tableNames = [], agentConnected, labels, pingStatus, onClose, onIncidentCreated, onLabelsUpdated }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState<Tab>('actions');
  const [executing, setExecuting] = useState<string | null>(null);
  const [switchProgress, setSwitchProgress] = useState<{ fait: number; total: number } | null>(null);
  const [machineIncidents, setMachineIncidents] = useState<BarIncident[]>([]);
  const [loadingIncidents, setLoadingIncidents] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [actionLogs, setActionLogs] = useState<ActionLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [selectedGame, setSelectedGame] = useState(BORNE_GAMES[0].value);
  const screenModes = SCREEN_MODES_BY_TYPE[machine.type];
  const [selectedScreenMode, setSelectedScreenMode] = useState(screenModes?.[0]?.value ?? '');
  const [editingLabels, setEditingLabels] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editTechName, setEditTechName] = useState('');
  const [savingLabels, setSavingLabels] = useState(false);

  const targetName = machine.type === 'all_tables' ? 'TABLE' : machine.name;
  const actions = ACTIONS_BY_TYPE[machine.type] ?? [];
  const canReport = ['table', 'borne', 'projo', 'bar'].includes(machine.type);

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

  const loadActionLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const { data } = await api.get<{ items: ActionLog[] }>(`/api/bar/action-logs?machine=${machine.name}`);
      setActionLogs(data.items);
    } catch {
      toast.error('Erreur chargement historique');
    } finally {
      setLoadingLogs(false);
    }
  }, [machine.name]);

  useEffect(() => {
    loadMachineIncidents();
    loadActionLogs();
  }, [loadMachineIncidents, loadActionLogs]);

  const handleExecute = async (action: ActionDef) => {
    if (action.variant === 'danger' && !confirm(`Confirmer : ${action.label} sur ${machine.label} ?`)) {
      return;
    }

    const actionId = action.id ?? action.command;
    setExecuting(actionId);
    try {
      await api.post('/api/bar/execute-command', {
        command: action.command,
        targetName,
      });
      if (action.logged) {
        api.post('/api/bar/action-logs', {
          machine_name: machine.name,
          action_label: action.label,
        }).catch(() => {});
      }
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

  const handleChangeScreenMode = async () => {
    setExecuting('screen_mode');
    try {
      // targetName = le nom du poste (PROJO, BAR01 ou BAR02) : la bascule
      // manuelle se fait ecran par ecran
      await api.post('/api/bar/execute-command', {
        command: 'url_edge_server',
        targetName,
        gameName: selectedScreenMode,
      });
      await api.post('/api/bar/execute-command', {
        command: 'restart_edge',
        targetName,
      });
      toast.success('Mode d\'affichage modifié');
    } catch (err: any) {
      const msg = err.response?.data?.message ?? 'Erreur lors de l\'exécution';
      toast.error(msg);
    } finally {
      setExecuting(null);
    }
  };

  /**
   * TEMPORAIRE — envoie les deux dalles de la table sur l'interface demandee.
   *
   * Reprend la mecanique deja en place pour le projecteur : url_edge_server
   * ecrit l'URL dans C:\INVADER\forceURL.txt sur le poste, puis restart_edge
   * relance le navigateur pour qu'il la prenne.
   *
   * Un appel PAR ECRAN, et pas un seul sur "TABLExx" : les scripts de l'agent
   * filtrent en `-like "*TargetName*"`, donc un appel groupe ecrirait la MEME
   * URL sur les deux dalles et elles se croiraient toutes les deux master.
   *
   * Non permanent par construction : le lanceur du poste vide forceURL.txt
   * apres lecture et ne garde l'URL qu'en memoire, donc au redemarrage du PC le
   * poste repart sur son URL habituelle, la V1.
   */
  /**
   * Bascule groupee de toutes les tables.
   *
   * On ne diffuse PAS une commande unique sur le prefixe TABLE : l'URL porte le
   * hostname de l'ecran (`?hostname=TABLE08-1`), donc une commande unique
   * donnerait la meme identite a toutes les dalles. On boucle donc table par
   * table, ecran par ecran.
   *
   * Une table eteinte ne doit pas bloquer les autres : chaque echec est compte
   * et signale a la fin, au lieu d'interrompre la serie. En revanche on abandonne
   * la table des que son premier ecran echoue, au lieu de tenter le second :
   * mieux vaut une table entierement restee en V1 qu'une table avec un ecran
   * dans chaque interface, qui ne ressemblerait a rien pour le client.
   */
  const handleSwitchAllInterfaces = async (target: 'v1' | 'v2') => {
    const cibles = tableNames;
    if (cibles.length === 0) {
      toast.error('Aucune table connue');
      return;
    }
    if (
      !confirm(
        `Basculer les ${cibles.length} tables du bar sur l'interface ${target.toUpperCase()} ?\n\n` +
          'Les deux ecrans de chaque table changent et leur navigateur redemarre.',
      )
    ) {
      return;
    }
    setExecuting(target === 'v2' ? 'switch_all_v2' : 'switch_all_v1');
    setSwitchProgress({ fait: 0, total: cibles.length });
    const echecs: string[] = [];
    try {
      for (const [index, nom] of cibles.entries()) {
        try {
          for (const suffix of ['-1', '-2']) {
            const hostname = `${nom}${suffix}`;
            const url =
              target === 'v2'
                ? `${V2_BASE_URL}?hostname=${hostname}`
                : `${V1_URL_BY_SCREEN[suffix]}&hostname=${hostname}`;
            await api.post('/api/bar/execute-command', {
              command: 'url_edge_server',
              targetName: hostname,
              gameName: url,
            });
          }
        } catch {
          echecs.push(nom);
        }
        setSwitchProgress({ fait: index + 1, total: cibles.length });
      }
      // un seul restart_edge sur le prefixe : la commande n'a pas besoin de
      // l'identite de l'ecran, contrairement a l'URL. On ne le lance pas si
      // aucune table n'a bascule : relancer dix navigateurs devant les clients
      // pour rien serait pire que de ne rien faire.
      if (echecs.length < cibles.length) {
        await api.post('/api/bar/execute-command', {
          command: 'restart_edge',
          targetName: 'TABLE',
        });
      }
      if (echecs.length === cibles.length) {
        toast.error(
          `Aucune table n'a bascule. Verifier que l'agent du comptoir tourne et que les PC sont allumes.`,
          { duration: 8000 },
        );
      } else if (echecs.length === 0) {
        toast.success(`${cibles.length} tables basculees sur l'interface ${target.toUpperCase()}`);
      } else {
        toast.error(
          `${cibles.length - echecs.length}/${cibles.length} tables basculees. Echec sur : ${echecs.join(', ')}`,
          { duration: 8000 },
        );
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Erreur lors de l'execution");
    } finally {
      setExecuting(null);
      setSwitchProgress(null);
    }
  };

  const handleSwitchInterface = async (target: 'v1' | 'v2') => {
    setExecuting(target === 'v2' ? 'switch_v2' : 'switch_v1');
    try {
      for (const suffix of ['-1', '-2']) {
        const hostname = `${machine.name}${suffix}`;
        const url = target === 'v2'
          ? `${V2_BASE_URL}?hostname=${hostname}`
          : `${V1_URL_BY_SCREEN[suffix]}&hostname=${hostname}`;
        await api.post('/api/bar/execute-command', {
          command: 'url_edge_server',
          targetName: hostname,
          gameName: url,
        });
      }
      await api.post('/api/bar/execute-command', {
        command: 'restart_edge',
        targetName: machine.name,
      });
      toast.success(
        `${labels?.display_name || machine.label} basculée sur l'interface ${target.toUpperCase()}`
      );
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
            <button
              onClick={() => setTab('historique')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
                tab === 'historique'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Historique
              {actionLogs.length > 0 && (
                <span className="bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5 rounded-full">
                  {actionLogs.length}
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
                    const actionId = action.id ?? action.command;
                    const Icon = COMMAND_ICONS[actionId] ?? COMMAND_ICONS[action.command] ?? Play;
                    return (
                      <button
                        key={actionId}
                        disabled={!agentConnected || executing !== null}
                        onClick={() => handleExecute(action)}
                        className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${
                          VARIANT_CLASSES[action.variant ?? 'default']
                        }`}
                      >
                        {executing === actionId ? (
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

                {screenModes && (
                  <div className="mt-4 pt-4 border-t">
                    <label className="block text-xs font-medium text-gray-500 mb-2">Mode d'affichage</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedScreenMode}
                        onChange={(e) => setSelectedScreenMode(e.target.value)}
                        disabled={!agentConnected || executing !== null}
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm bg-white disabled:opacity-50"
                      >
                        {screenModes.map((mode) => (
                          <option key={mode.label} value={mode.value}>
                            {mode.label}
                          </option>
                        ))}
                      </select>
                      <button
                        disabled={!agentConnected || executing !== null}
                        onClick={handleChangeScreenMode}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-green-100 hover:bg-green-200 text-green-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {executing === 'screen_mode' ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                        Appliquer
                      </button>
                    </div>
                    {selectedScreenMode === V2_PROJO_URL && (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                        <p className="font-semibold">Un clic sur le projecteur est nécessaire après bascule.</p>
                        <p className="mt-1">
                          Le navigateur bloque le son tant que personne n'a cliqué sur la page : un
                          voile « Cliquer pour activer le son » reste affiché. Sans ce clic, le
                          blindtest et les effets sonores seront muets.
                        </p>
                        <p className="mt-1.5">
                          Cet écran couvre le quiz <strong>et</strong> le battle : il suit la session
                          lancée depuis « Quiz live » ou « Battle live », et affiche un écran
                          d'attente entre deux parties. Lancer ou arrêter une session bascule
                          désormais le projecteur et les TV du bar automatiquement.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* TEMPORAIRE : bascule groupee de toutes les tables */}
                {machine.type === 'all_tables' && (
                  <div className="mt-4 pt-4 border-t">
                    <label className="block text-xs font-medium text-gray-500 mb-2">
                      Interface de toutes les tables
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        disabled={!agentConnected || executing !== null}
                        onClick={() => handleSwitchAllInterfaces('v2')}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-indigo-100 hover:bg-indigo-200 text-indigo-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {executing === 'switch_all_v2' ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <FlaskConical className="w-4 h-4" />
                        )}
                        Tout passer en V2
                      </button>
                      <button
                        disabled={!agentConnected || executing !== null}
                        onClick={() => handleSwitchAllInterfaces('v1')}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {executing === 'switch_all_v1' ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RotateCcw className="w-4 h-4" />
                        )}
                        Tout ramener en V1
                      </button>
                    </div>
                    {switchProgress ? (
                      <div className="mt-2">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                          <div
                            className="h-full bg-indigo-500 transition-all duration-200"
                            style={{ width: `${(switchProgress.fait / switchProgress.total) * 100}%` }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-gray-500 tabular-nums">
                          {switchProgress.fait} / {switchProgress.total} tables
                        </p>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-gray-400">
                        Bascule les deux écrans des {tableNames.length} tables du bar, puis relance
                        leur navigateur. Une table éteinte est signalée sans bloquer les autres. Au
                        redémarrage d'un PC, la table repart sur la V1.
                      </p>
                    )}
                  </div>
                )}

                {/* TEMPORAIRE : bascule entre l'ancienne et la nouvelle interface */}
                {machine.type === 'table' && (
                  <div className="mt-4 pt-4 border-t">
                    <label className="block text-xs font-medium text-gray-500 mb-2">
                      Interface de la table
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        disabled={!agentConnected || executing !== null}
                        onClick={() => handleSwitchInterface('v2')}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-indigo-100 hover:bg-indigo-200 text-indigo-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {executing === 'switch_v2' ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <FlaskConical className="w-4 h-4" />
                        )}
                        Passer en V2
                      </button>
                      <button
                        disabled={!agentConnected || executing !== null}
                        onClick={() => handleSwitchInterface('v1')}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {executing === 'switch_v1' ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RotateCcw className="w-4 h-4" />
                        )}
                        Revenir en V1
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-gray-400">
                      Bascule les deux écrans de {labels?.display_name || machine.label} (
                      {machine.name}-1 et {machine.name}-2) et relance leur navigateur. Sans effet sur
                      les autres tables. Au redémarrage du PC, la table repart sur la V1.
                    </p>
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

            {tab === 'historique' && (
              <div className="space-y-3">
                {loadingLogs ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : actionLogs.length === 0 ? (
                  <p className="text-center text-gray-400 py-8 text-sm">Aucune action enregistrée (30 derniers jours)</p>
                ) : (
                  <div className="space-y-2">
                    {actionLogs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50 text-sm"
                      >
                        <span className="font-medium text-gray-900">{log.action_label}</span>
                        <span className="text-gray-400 text-xs whitespace-nowrap ml-4">
                          {new Date(log.created_at).toLocaleString('fr-FR')}
                        </span>
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
