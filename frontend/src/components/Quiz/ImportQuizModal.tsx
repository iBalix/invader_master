import { useState, useRef, useEffect } from 'react';
import { X, Loader2, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  onClose: () => void;
  onImported: () => void;
}

interface ProgressLine {
  message: string;
  type: 'info' | 'success' | 'error';
}

export default function ImportQuizModal({ onClose, onImported }: Props) {
  const [entryId, setEntryId] = useState('');
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [lines, setLines] = useState<ProgressLine[]>([]);
  const [questionProgress, setQuestionProgress] = useState<{ current: number; total: number } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  const addLine = (message: string, type: ProgressLine['type'] = 'info') => {
    setLines((prev) => [...prev, { message, type }]);
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = entryId.trim();
    if (!trimmed) return;

    setImporting(true);
    setError('');
    setLines([]);
    setDone(false);
    setQuestionProgress(null);

    const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
    const token = localStorage.getItem('access_token');

    try {
      const response = await fetch(`${API_URL}/api/import/contentful-quiz`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ entryId: trimmed }),
      });

      if (!response.ok && response.headers.get('content-type')?.includes('application/json')) {
        const errData = await response.json();
        setError(errData.message || "Erreur lors de l'import");
        setImporting(false);
        return;
      }

      if (!response.body) {
        setError('Pas de réponse du serveur');
        setImporting(false);
        return;
      }

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
                data.step === 'question_error' || data.step === 'question_skip'
                  ? 'error'
                  : data.step?.endsWith('_done') || data.step === 'quiz_created'
                    ? 'success'
                    : 'info';
              addLine(data.message, lineType);

              if (data.current && data.total) {
                setQuestionProgress({ current: data.current, total: data.total });
              }
            } else if (eventType === 'done') {
              addLine(
                `Import terminé ! ${data.quiz.questionCount} questions importées.`,
                'success',
              );
              setDone(true);
              setImporting(false);
              toast.success(`Quiz "${data.quiz.name}" importé (${data.quiz.questionCount} questions)`);
              onImported();
            } else if (eventType === 'error') {
              setError(data.message);
              setImporting(false);
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      if (!done) setImporting(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur lors de l'import";
      setError(msg);
      setImporting(false);
    }
  };

  const progressPercent =
    questionProgress && questionProgress.total > 0
      ? Math.round((questionProgress.current / questionProgress.total) * 100)
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold">Importer un quiz depuis Contentful</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition"
            disabled={importing}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleImport} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ID Contentful du quiz
            </label>
            <input
              type="text"
              value={entryId}
              onChange={(e) => setEntryId(e.target.value)}
              placeholder="Ex : 3xYz1AbCdEfGhIjKlMnOpQ"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
              disabled={importing || done}
              autoFocus
            />
            <p className="mt-1 text-xs text-gray-400">
              L'ID de l'entrée "Quizz" dans Contentful (visible dans l'URL de l'entrée)
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {lines.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              {questionProgress && (importing || done) && (
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                    <span>Questions</span>
                    <span>
                      {questionProgress.current}/{questionProgress.total} ({progressPercent}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}
              <div className="max-h-64 overflow-y-auto p-3 space-y-1 bg-gray-50 font-mono text-xs">
                {lines.map((line, i) => (
                  <div
                    key={i}
                    className={
                      line.type === 'success'
                        ? 'text-green-700'
                        : line.type === 'error'
                          ? 'text-red-600'
                          : 'text-gray-600'
                    }
                  >
                    {line.type === 'success' && '✓ '}
                    {line.type === 'error' && '✗ '}
                    {line.message}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            {done ? (
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
              >
                <CheckCircle2 className="w-4 h-4" />
                Fermer
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={importing}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={importing || !entryId.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition disabled:opacity-50"
                >
                  {importing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {importing ? 'Import en cours...' : 'Importer'}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
