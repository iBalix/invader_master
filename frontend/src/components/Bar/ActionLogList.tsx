import type { ActionLog, MachineLabels } from '../../pages/BarManagementPage';

interface Props {
  logs: ActionLog[];
  machineLabels: Record<string, MachineLabels>;
}

export default function ActionLogList({ logs, machineLabels }: Props) {
  if (logs.length === 0) {
    return <p className="text-center text-gray-400 py-8 text-sm">Aucune action enregistrée (30 derniers jours)</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="pb-2 pr-4 font-medium">Element</th>
            <th className="pb-2 pr-4 font-medium">Poste</th>
            <th className="pb-2 pr-4 font-medium">Action</th>
            <th className="pb-2 font-medium">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {logs.map((log) => (
            <tr key={log.id} className="text-gray-900">
              <td className="py-3 pr-4 font-medium whitespace-nowrap">
                {machineLabels[log.machine_name]?.display_name || log.machine_name}
              </td>
              <td className="py-3 pr-4 whitespace-nowrap text-gray-500">
                {machineLabels[log.machine_name]?.technical_name || '—'}
              </td>
              <td className="py-3 pr-4">
                <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                  {log.action_label}
                </span>
              </td>
              <td className="py-3 whitespace-nowrap text-gray-500">
                {new Date(log.created_at).toLocaleString('fr-FR')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
