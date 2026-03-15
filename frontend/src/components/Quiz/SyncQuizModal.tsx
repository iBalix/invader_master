import { useState, useRef, useEffect } from 'react';
import { X, Loader2, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';

interface Props {
  onClose: () => void;
  onImported: () => void;
}

interface MissingQuiz {
  contentfulId: string;
  name: string;
}

interface MissingQuestion {
  contentfulId: string;
  question: string;
}

interface DiffResult {
  missingQuizzes: MissingQuiz[];
  missingQuestions: MissingQuestion[];
  totalContentfulQuizzes: number;
  totalContentfulQuestions: number;
  totalDbQuizzes: number;
  totalDbQuestions: number;
}

interface ProgressLine {
  message: string;
  type: 'info' | 'success' | 'error';
}

export default function SyncQuizModal({ onClose, onImported }: Props) {
  const [loading, setLoading] = useState(true);
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [lines, setLines] = useState<ProgressLine[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  const addLine = (message: string, type: ProgressLine['type'] = 'info') => {
    setLines((prev) => [...prev, { message, type }]);
  };

  useEffect(() => {
    loadDiff();
  }, []);

  const loadDiff = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/api/import/diff-contentful-quizzes');
      setDiff(data);
    } catch {
      setError('Erreur lors de la comparaison avec Contentful');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    if (!diff || diff.missingQuizzes.length === 0) return;

    setSyncing(true);
    setError('');
    setLines([]);
    setProgress(null);

    const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
    const token = localStorage.getItem('access_token');
    const quizIds = diff.missingQuizzes.map((q) => q.contentfulId);

    try {
      const response = await fetch(`${API_URL}/api/import/sync-contentful-quizzes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ quizIds }),
      });

      if (!response.ok && response.headers.get('content-type')?.includes('application/json')) {
        const errData = await response.json();
        setError(errData.message || 'Erreur lors de la synchronisation');
        setSyncing(false);
        return;
      }

      if (!response.body) { setError('Pas de réponse du serveur'); setSyncing(false); return; }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const eventLines = part.split('\n');
          let eventType = '';
          let eventData = '';
          for (const line of eventLines) {
            if (line.startsWith('event: ')) eventType = line.slice(7);
            if (line.startsWith('data: ')) eventData = line.slice(6);
          }
          if (!eventData) continue;
          try {
            const data = JSON.parse(eventData);
            if (eventType === 'progress') {
              const lineType: ProgressLine['type'] =
                data.step?.includes('error') ? 'error' : data.step?.endsWith('_done') ? 'success' : 'info';
              addLine(data.message, lineType);
              if (data.current && data.total) setProgress({ current: data.current, total: data.total });
            } else if (eventType === 'done') {
              addLine(`Synchronisation terminée ! ${data.quizzes} quiz, ${data.questions} questions.`, 'success');
              setDone(true);
              setSyncing(false);
              toast.success(`${data.quizzes} quiz synchronisés`);
              onImported();
            } else if (eventType === 'error') {
              setError(data.message);
              setSyncing(false);
            }
          } catch { /* ignore */ }
        }
      }
      if (!done) setSyncing(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la synchronisation');
      setSyncing(false);
    }
  };

  const progressPercent = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold">Synchroniser Contentful</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition" disabled={syncing}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8 gap-3 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Comparaison avec Contentful en cours...</span>
            </div>
          ) : diff && !syncing && !done ? (
            <>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-500">Contentful</p>
                  <p className="text-lg font-bold">{diff.totalContentfulQuizzes} quiz, {diff.totalContentfulQuestions} questions</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-500">Invader Master</p>
                  <p className="text-lg font-bold">{diff.totalDbQuizzes} quiz, {diff.totalDbQuestions} questions</p>
                </div>
              </div>

              {diff.missingQuizzes.length === 0 && diff.missingQuestions.length === 0 ? (
                <div className="text-center py-6">
                  <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
                  <p className="text-green-700 font-medium">Tout est synchronisé</p>
                  <p className="text-sm text-gray-500 mt-1">Aucune différence trouvée entre Contentful et Invader Master</p>
                </div>
              ) : (
                <>
                  {diff.missingQuizzes.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">
                        Quiz manquants ({diff.missingQuizzes.length})
                      </h3>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {diff.missingQuizzes.map((q) => (
                          <div key={q.contentfulId} className="flex items-center gap-2 p-2 bg-orange-50 border border-orange-200 rounded text-sm">
                            <span className="w-2 h-2 bg-orange-400 rounded-full flex-shrink-0" />
                            <span className="font-medium">{q.name}</span>
                            <span className="text-xs text-gray-400 font-mono ml-auto">{q.contentfulId}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {diff.missingQuestions.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">
                        Questions orphelines manquantes ({diff.missingQuestions.length})
                      </h3>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {diff.missingQuestions.map((q) => (
                          <div key={q.contentfulId} className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                            <span className="w-2 h-2 bg-blue-400 rounded-full flex-shrink-0" />
                            <span className="truncate flex-1">{q.question}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Les questions seront importees avec leurs quiz respectifs</p>
                    </div>
                  )}
                </>
              )}
            </>
          ) : null}

          {lines.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              {progress && (syncing || done) && (
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                    <span>Progression</span>
                    <span>{progress.current}/{progress.total} ({progressPercent}%)</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-primary-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                  </div>
                </div>
              )}
              <div className="max-h-48 overflow-y-auto p-3 space-y-1 bg-gray-50 font-mono text-xs">
                {lines.map((line, i) => (
                  <div key={i} className={line.type === 'success' ? 'text-green-700' : line.type === 'error' ? 'text-red-600' : 'text-gray-600'}>
                    {line.type === 'success' && '✓ '}{line.type === 'error' && '✗ '}{line.message}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            {done ? (
              <button type="button" onClick={onClose}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
                <CheckCircle2 className="w-4 h-4" />Fermer
              </button>
            ) : (
              <>
                <button type="button" onClick={onClose} disabled={syncing}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50">
                  Annuler
                </button>
                {diff && diff.missingQuizzes.length > 0 && (
                  <button type="button" onClick={handleSync} disabled={syncing || loading}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition disabled:opacity-50">
                    {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {syncing ? 'Synchronisation...' : 'Valider la synchronisation'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
