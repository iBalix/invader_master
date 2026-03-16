import { useState, useRef, useCallback } from 'react';
import { Upload, FileSpreadsheet, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

type ImportType = 'sales' | 'flux';
type ImportStatus = 'idle' | 'uploading' | 'done' | 'error';

interface LogEntry {
  message: string;
  type: 'info' | 'success' | 'error';
}

interface ImportState {
  file: File | null;
  status: ImportStatus;
  logs: LogEntry[];
  result: Record<string, unknown> | null;
}

function useFileImport(type: ImportType) {
  const [state, setState] = useState<ImportState>({
    file: null, status: 'idle', logs: [], result: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const setFile = (file: File | null) => {
    setState({ file, status: 'idle', logs: [], result: null });
  };

  const start = useCallback(async () => {
    if (!state.file) return;

    setState((s) => ({ ...s, status: 'uploading', logs: [], result: null }));

    const formData = new FormData();
    formData.append('file', state.file);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_URL}/api/finance-import/${type}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ') && eventType) {
            try {
              const payload = JSON.parse(line.slice(6));
              if (eventType === 'progress') {
                setState((s) => ({
                  ...s,
                  logs: [...s.logs, { message: payload.message, type: 'info' }],
                }));
              } else if (eventType === 'done') {
                setState((s) => ({
                  ...s,
                  status: 'done',
                  result: payload,
                  logs: [...s.logs, { message: 'Import terminé !', type: 'success' }],
                }));
              } else if (eventType === 'error') {
                setState((s) => ({
                  ...s,
                  status: 'error',
                  logs: [...s.logs, { message: payload.message, type: 'error' }],
                }));
              }
            } catch { /* malformed JSON line */ }
            eventType = '';
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      setState((s) => ({
        ...s,
        status: 'error',
        logs: [...s.logs, { message, type: 'error' }],
      }));
      toast.error(message);
    }
  }, [state.file, type]);

  const reset = () => {
    abortRef.current?.abort();
    setState({ file: null, status: 'idle', logs: [], result: null });
  };

  return { state, setFile, start, reset };
}

function DropZone({
  title,
  subtitle,
  instructions,
  importHook,
  accentFrom,
  accentTo,
}: {
  title: string;
  subtitle: string;
  instructions: { text: string; steps: string[] };
  importHook: ReturnType<typeof useFileImport>;
  accentFrom: string;
  accentTo: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const { state, setFile, start, reset } = importHook;

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) {
      setFile(f);
    } else {
      toast.error('Fichier .xlsx attendu');
    }
  }, [setFile]);

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const isWorking = state.status === 'uploading';

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
      {/* Header */}
      <div className={`bg-gradient-to-r ${accentFrom} ${accentTo} px-6 py-4`}>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="text-sm text-white/80">{subtitle}</p>
      </div>

      <div className="p-6 flex flex-col flex-1">
        {/* Instructions */}
        <div className="bg-gray-50 rounded-lg p-4 mb-4 text-sm">
          <p className="font-medium text-gray-700 mb-2">{instructions.text}</p>
          <ol className="list-decimal list-inside space-y-1 text-gray-500">
            {instructions.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </div>

        {/* Drop zone / file info */}
        {!state.file ? (
          <div
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all flex-1 flex flex-col items-center justify-center
              ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'}
            `}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="w-10 h-10 text-gray-400 mb-3" />
            <p className="text-sm text-gray-600 font-medium">Glissez un fichier .xlsx ici</p>
            <p className="text-xs text-gray-400 mt-1">ou cliquez pour parcourir</p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleSelect}
            />
          </div>
        ) : (
          <div className="space-y-4 flex-1 flex flex-col">
            {/* File info */}
            <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
              <FileSpreadsheet className="w-8 h-8 text-green-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{state.file.name}</p>
                <p className="text-xs text-gray-500">{(state.file.size / 1024).toFixed(0)} Ko</p>
              </div>
              {state.status === 'idle' && (
                <button onClick={reset} className="p-1 hover:bg-gray-200 rounded">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              )}
            </div>

            {/* Action button */}
            {state.status === 'idle' && (
              <button
                onClick={start}
                className={`w-full py-3 rounded-lg text-white font-medium transition bg-gradient-to-r ${accentFrom} ${accentTo} hover:opacity-90`}
              >
                Lancer l'import
              </button>
            )}

            {/* Log console */}
            {state.logs.length > 0 && (
              <div className="bg-gray-900 rounded-lg p-4 flex-1 min-h-[160px] max-h-[280px] overflow-y-auto font-mono text-xs space-y-1">
                {state.logs.map((log, i) => (
                  <div key={i} className={
                    log.type === 'error' ? 'text-red-400' :
                    log.type === 'success' ? 'text-green-400' : 'text-gray-300'
                  }>
                    {log.message}
                  </div>
                ))}
                {isWorking && (
                  <div className="flex items-center gap-2 text-blue-400">
                    <Loader2 className="w-3 h-3 animate-spin" /> En cours...
                  </div>
                )}
              </div>
            )}

            {/* Result banner */}
            {state.status === 'done' && state.result && (
              <ResultBanner result={state.result} onReset={reset} />
            )}
            {state.status === 'error' && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <span className="text-sm text-red-700">L'import a rencontré une erreur.</span>
                <button onClick={reset} className="ml-auto text-sm text-red-600 underline">Réessayer</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ResultBanner({ result, onReset }: { result: Record<string, unknown>; onReset: () => void }) {
  const entries = Object.entries(result).filter(([k]) => k !== 'total');
  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <CheckCircle2 className="w-5 h-5 text-green-600" />
        <span className="font-medium text-green-800">Import terminé</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
        {entries.map(([key, val]) => (
          <div key={key} className="text-gray-600">
            <span className="capitalize">{formatLabel(key)}</span> : <span className="font-semibold text-gray-800">{String(val)}</span>
          </div>
        ))}
      </div>
      <button onClick={onReset} className="text-sm text-green-700 underline hover:text-green-900">
        Nouvel import
      </button>
    </div>
  );
}

function formatLabel(key: string): string {
  const labels: Record<string, string> = {
    imported: 'Insérées',
    updated: 'Mises à jour',
    skipped: 'Ignorées',
    backfilled: 'Catégories remplies',
  };
  return labels[key] ?? key;
}

export default function ImportFinancesPage() {
  const salesImport = useFileImport('sales');
  const fluxImport = useFileImport('flux');

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Import finances</h1>
      <p className="text-gray-600 mb-6">
        Importez vos fichiers Excel de ventes (Popina) et de transactions bancaires (Tiime).
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DropZone
          title="Ventes Popina"
          subtitle="Fichier export produits (.xlsx)"
          instructions={{
            text: 'Comment récupérer le fichier :',
            steps: [
              'Aller sur backoffice.popina.com',
              'Cliquer sur Statistiques',
              'Sélectionner les dates souhaitées',
              'Descendre jusqu\'à "Export des produits"',
              'Cliquer sur "Télécharger"',
            ],
          }}
          importHook={salesImport}
          accentFrom="from-indigo-500"
          accentTo="to-purple-600"
        />

        <DropZone
          title="Flux Tiime"
          subtitle="Export des transactions bancaires (.xlsx)"
          instructions={{
            text: 'Comment récupérer le fichier :',
            steps: [
              'Aller sur apps.tiime.fr',
              'Filtrer par date (ex: ">10/09/2025")',
              'Cliquer sur "Export mes transactions"',
            ],
          }}
          importHook={fluxImport}
          accentFrom="from-emerald-500"
          accentTo="to-teal-600"
        />
      </div>
    </div>
  );
}
