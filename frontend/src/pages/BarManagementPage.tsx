import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, Wifi, WifiOff, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import MachineActionModal from '../components/Bar/MachineActionModal';
import IncidentList from '../components/Bar/IncidentList';

export interface BarIncident {
  id: string;
  machine_name: string;
  machine_type: string;
  reason: string;
  description: string | null;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  created_by: string | null;
}

export type MachineType = 'table' | 'borne' | 'bar' | 'tv' | 'projo' | 'all_tables';

export interface MachineConfig {
  name: string;
  type: MachineType;
  label: string;
  gridArea: string;
}

export interface MachineLabels {
  display_name: string;
  technical_name: string;
}

const MACHINES: MachineConfig[] = [
  { name: 'TABLE02', type: 'table', label: 'TABLE02', gridArea: 'T02' },
  { name: 'TABLE03', type: 'table', label: 'TABLE03', gridArea: 'T03' },
  { name: 'TABLE05', type: 'table', label: 'TABLE05', gridArea: 'T05' },
  { name: 'TABLE06', type: 'table', label: 'TABLE06', gridArea: 'T06' },
  { name: 'PROJO',   type: 'projo', label: 'PROJO',   gridArea: 'PRJ' },
  { name: 'TABLE07', type: 'table', label: 'TABLE07', gridArea: 'T07' },
  { name: 'BAR02',   type: 'bar',   label: 'BAR02',   gridArea: 'B02' },
  { name: 'TABLE08', type: 'table', label: 'TABLE08', gridArea: 'T08' },
  { name: 'BAR01',   type: 'bar',   label: 'BAR01',   gridArea: 'B01' },
  { name: 'TABLE09', type: 'table', label: 'TABLE09', gridArea: 'T09' },
  { name: 'TABLE01', type: 'table', label: 'TABLE01', gridArea: 'T01' },
  { name: 'TABLE04', type: 'table', label: 'TABLE04', gridArea: 'T04' },
  { name: 'TABLE10', type: 'table', label: 'TABLE10', gridArea: 'T10' },
  { name: 'BORNE01', type: 'borne', label: 'BORNE01', gridArea: 'BN1' },
  { name: 'BORNE02', type: 'borne', label: 'BORNE02', gridArea: 'BN2' },
  { name: 'BORNE03', type: 'borne', label: 'BORNE03', gridArea: 'BN3' },
  { name: 'BORNE04', type: 'borne', label: 'BORNE04', gridArea: 'BN4' },
  { name: 'ALL TABLES', type: 'all_tables', label: 'ALL TABLES', gridArea: 'ALL' },
  { name: 'TV01',    type: 'tv',    label: 'TV01',    gridArea: 'TV1' },
  { name: 'TV02',    type: 'tv',    label: 'TV02',    gridArea: 'TV2' },
  { name: 'TV03',    type: 'tv',    label: 'TV03',    gridArea: 'TV3' },
];

const TYPE_COLORS: Record<MachineType, string> = {
  table: 'bg-blue-500 hover:bg-blue-600',
  borne: 'bg-amber-500 hover:bg-amber-600',
  bar: 'bg-gray-500 hover:bg-gray-600',
  tv: 'bg-gray-500 hover:bg-gray-600',
  projo: 'bg-red-500 hover:bg-red-600',
  all_tables: 'bg-teal-600 hover:bg-teal-700',
};

const TYPE_ICONS: Partial<Record<MachineType, string>> = {
  bar: '🖥',
  tv: '🖥',
};

const GRID_TEMPLATE = `
  "T02 .   .   T03 T05 .   .   T06"
  ".   .   .   .   PRJ .   .   T07"
  "B02 .   .   .   .   .   .   T08"
  "B01 .   .   .   .   .   .   T09"
  ".   .   .   T01 T04 .   .   T10"
  "BN1 BN2 BN3 BN4 .   .   .   ."
  "ALL TV1 TV2 TV3 .   .   .   ."
`;

export default function BarManagementPage() {
  const [incidents, setIncidents] = useState<BarIncident[]>([]);
  const [agentConnected, setAgentConnected] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<MachineConfig | null>(null);
  const [showIncidents, setShowIncidents] = useState(true);
  const [machineLabels, setMachineLabels] = useState<Record<string, MachineLabels>>({});
  const [pingStatus, setPingStatus] = useState<Record<string, boolean>>({});

  const loadIncidents = useCallback(async () => {
    try {
      const { data } = await api.get<{ items: BarIncident[] }>('/api/bar/incidents');
      setIncidents(data.items);
    } catch {
      toast.error('Erreur chargement des incidents');
    }
  }, []);

  const loadLabels = useCallback(async () => {
    try {
      const { data } = await api.get<{ labels: Record<string, MachineLabels> }>('/api/bar/machine-labels');
      setMachineLabels(data.labels);
    } catch { /* silent */ }
  }, []);

  const loadPingStatus = useCallback(async () => {
    try {
      const { data } = await api.get<{ results: Record<string, boolean> }>('/api/bar/ping-status');
      setPingStatus(data.results ?? {});
    } catch { /* silent */ }
  }, []);

  const checkAgentStatus = useCallback(async () => {
    try {
      const { data } = await api.get<{ connected: boolean }>('/api/bar/agent-status');
      setAgentConnected(data.connected);
    } catch {
      setAgentConnected(false);
    }
  }, []);

  useEffect(() => {
    loadIncidents();
    loadLabels();
    checkAgentStatus();
    loadPingStatus();
    const agentInterval = setInterval(checkAgentStatus, 15_000);
    const pingInterval = setInterval(loadPingStatus, 30_000);
    return () => {
      clearInterval(agentInterval);
      clearInterval(pingInterval);
    };
  }, [loadIncidents, loadLabels, checkAgentStatus, loadPingStatus]);

  const hasPingData = Object.keys(pingStatus).length > 0;

  const getDownSides = (machine: MachineConfig): string | null => {
    if (!hasPingData || machine.type === 'all_tables') return null;

    if (machine.type === 'table') {
      const num = machine.name.replace('TABLE', '');
      const side1 = pingStatus[`TABLE${num}-1`];
      const side2 = pingStatus[`TABLE${num}-2`];
      if (side1 === undefined && side2 === undefined) return null;
      const down: string[] = [];
      if (side1 === false) down.push('1');
      if (side2 === false) down.push('2');
      return down.length > 0 ? down.join(',') : null;
    }

    const alive = pingStatus[machine.name];
    if (alive === undefined) return null;
    return alive ? null : '';
  };

  const unresolvedByMachine = incidents
    .filter((i) => !i.resolved)
    .reduce<Record<string, number>>((acc, i) => {
      acc[i.machine_name] = (acc[i.machine_name] ?? 0) + 1;
      return acc;
    }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion bar</h1>
          <p className="text-gray-500 mt-1">Plan du bar — cliquez sur un élément pour interagir</p>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
          agentConnected
            ? 'bg-green-100 text-green-700'
            : 'bg-red-100 text-red-700'
        }`}>
          {agentConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
          Agent {agentConnected ? 'connecté' : 'déconnecté'}
        </div>
      </div>

      {/* Floor plan */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div
          className="grid gap-3 mx-auto"
          style={{
            gridTemplateAreas: GRID_TEMPLATE,
            gridTemplateColumns: 'repeat(8, minmax(80px, 110px))',
            gridTemplateRows: 'repeat(7, 80px)',
            maxWidth: '960px',
          }}
        >
          {MACHINES.map((machine) => {
            const unresolvedCount = unresolvedByMachine[machine.name] ?? 0;
            const labels = machineLabels[machine.name];
            const displayName = labels?.display_name || machine.label;
            const techName = labels?.technical_name || '';
            const downSides = getDownSides(machine);
            return (
              <button
                key={machine.name}
                onClick={() => setSelectedMachine(machine)}
                className={`relative rounded-lg text-white font-bold text-xs flex flex-col items-center justify-center gap-0.5 transition-all shadow-md active:scale-95 cursor-pointer px-1 ${TYPE_COLORS[machine.type]}`}
                style={{ gridArea: machine.gridArea }}
              >
                {TYPE_ICONS[machine.type] && (
                  <span className="text-base leading-none">{TYPE_ICONS[machine.type]}</span>
                )}
                <span className="truncate max-w-full leading-tight">{displayName}</span>
                {techName && (
                  <span className="text-[9px] font-normal opacity-70 truncate max-w-full leading-tight">{techName}</span>
                )}
                {unresolvedCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-6 h-6 bg-yellow-400 text-yellow-900 rounded-full shadow text-xs">
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </span>
                )}
                {downSides !== null && (
                  <span
                    className="absolute -bottom-1.5 -left-1.5 flex items-center gap-0.5 bg-red-600 text-white rounded-full shadow px-1 py-0.5"
                    title={downSides ? `Cote ${downSides} injoignable` : 'Injoignable'}
                  >
                    <WifiOff className="w-3 h-3" />
                    {downSides && <span className="text-[9px] font-bold leading-none">{downSides}</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Incidents section */}
      <div className="bg-white rounded-xl shadow-sm border">
        <button
          onClick={() => setShowIncidents(!showIncidents)}
          className="w-full flex items-center justify-between px-6 py-4 text-left"
        >
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Incidents signalés</h2>
            {incidents.filter((i) => !i.resolved).length > 0 && (
              <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                {incidents.filter((i) => !i.resolved).length} non résolu(s)
              </span>
            )}
          </div>
          {showIncidents ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>
        {showIncidents && (
          <div className="px-6 pb-6">
            <IncidentList incidents={incidents} onUpdate={loadIncidents} />
          </div>
        )}
      </div>

      {/* Action modal */}
      {selectedMachine && (
        <MachineActionModal
          machine={selectedMachine}
          agentConnected={agentConnected}
          labels={machineLabels[selectedMachine.name]}
          onClose={() => setSelectedMachine(null)}
          onIncidentCreated={loadIncidents}
          onLabelsUpdated={loadLabels}
        />
      )}
    </div>
  );
}
