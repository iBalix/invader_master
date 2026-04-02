import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Trash2, Pencil, Sparkles, Download, AlertTriangle,
  Search, X, Info, Loader2, Filter,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import BattleQuestionModal, { type BattleQuestionData } from '../components/Battle/BattleQuestionModal';

interface Question {
  id: number;
  question: string;
  difficulty: string;
  theme: string;
  answers: string[];
  help_story: string;
  created_at: string;
}

interface Stats {
  Facile: number;
  Moyen: number;
  Difficile: number;
  total: number;
}

type Difficulty = 'Facile' | 'Moyen' | 'Difficile';

const DIFFICULTIES: { key: Difficulty; color: string; bg: string; ring: string; badge: string }[] = [
  { key: 'Facile', color: 'text-green-700', bg: 'bg-green-50', ring: 'ring-green-500', badge: 'bg-green-500' },
  { key: 'Moyen', color: 'text-yellow-700', bg: 'bg-yellow-50', ring: 'ring-yellow-500', badge: 'bg-yellow-500' },
  { key: 'Difficile', color: 'text-red-700', bg: 'bg-red-50', ring: 'ring-red-500', badge: 'bg-red-500' },
];

export default function BattleQuestionsPage() {
  const [difficulty, setDifficulty] = useState<Difficulty>('Facile');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [stats, setStats] = useState<Stats>({ Facile: 0, Moyen: 0, Difficile: 0, total: 0 });
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [modal, setModal] = useState<{ open: boolean; editing: BattleQuestionData | null }>({ open: false, editing: null });

  const [genCategory, setGenCategory] = useState('random');
  const [genHint, setGenHint] = useState('');
  const [genCount, setGenCount] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [importing, setImporting] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const { data } = await api.get('/api/battle-questions/stats');
      setStats(data.stats);
    } catch { /* silent */ }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const { data } = await api.get('/api/battle-questions/categories');
      setCategories(data.categories ?? []);
    } catch { /* silent */ }
  }, []);

  const loadQuestions = useCallback(async (diff: Difficulty) => {
    try {
      const { data } = await api.get(`/api/battle-questions?difficulty=${diff}`);
      setQuestions(data.questions ?? []);
    } catch {
      toast.error('Erreur de chargement des questions');
    }
  }, []);

  useEffect(() => {
    Promise.all([loadStats(), loadCategories(), loadQuestions(difficulty)]).finally(() => setLoading(false));
  }, [loadStats, loadCategories, loadQuestions, difficulty]);

  const switchDifficulty = (d: Difficulty) => {
    setDifficulty(d);
    setCategoryFilter('');
    setSearch('');
    setLoading(true);
    loadQuestions(d).finally(() => setLoading(false));
    loadStats();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer cette question ?')) return;
    try {
      await api.delete(`/api/battle-questions/${id}`);
      toast.success('Question supprimée');
      loadQuestions(difficulty);
      loadStats();
    } catch { toast.error('Erreur lors de la suppression'); }
  };

  const handleClearDifficulty = async () => {
    if (!confirm(`Supprimer TOUTES les questions "${difficulty}" ? Cette action est irréversible !`)) return;
    try {
      await api.delete(`/api/battle-questions/clear/${difficulty}`);
      toast.success(`Toutes les questions ${difficulty} supprimées`);
      loadQuestions(difficulty);
      loadStats();
    } catch { toast.error('Erreur lors de la suppression'); }
  };

  const handleSave = async (data: BattleQuestionData) => {
    try {
      if (data.id) {
        await api.put(`/api/battle-questions/${data.id}`, data);
        toast.success('Question modifiée');
      } else {
        await api.post('/api/battle-questions', data);
        toast.success('Question ajoutée');
      }
      setModal({ open: false, editing: null });
      loadQuestions(difficulty);
      loadStats();
      loadCategories();
    } catch { toast.error('Erreur lors de la sauvegarde'); }
  };

  const handleGenerate = async () => {
    if (genCount < 1 || genCount > 10) {
      toast.error('Le nombre doit être entre 1 et 10');
      return;
    }
    setGenerating(true);
    try {
      const { data } = await api.post('/api/battle-questions/generate', {
        difficulty,
        count: genCount,
        category: genCategory,
        hint: genHint,
      });
      toast.success(data.message);
      loadQuestions(difficulty);
      loadStats();
      loadCategories();
    } catch {
      toast.error('Erreur lors de la génération');
    } finally {
      setGenerating(false);
    }
  };

  const handleImport = async () => {
    if (!confirm('Importer les questions depuis le serveur distant ? Les doublons seront ignorés.')) return;
    setImporting(true);
    try {
      const { data } = await api.post('/api/battle-questions/import');
      toast.success(data.message);
      loadQuestions(difficulty);
      loadStats();
      loadCategories();
    } catch {
      toast.error("Erreur lors de l'import");
    } finally {
      setImporting(false);
    }
  };

  const openEdit = (q: Question) => {
    const correctIdx = q.answers.findIndex((a) => a.includes('(OK)'));
    setModal({
      open: true,
      editing: {
        id: q.id,
        question: q.question,
        difficulty: q.difficulty,
        theme: q.theme,
        answers: q.answers,
        correctAnswer: correctIdx >= 0 ? correctIdx : 0,
        help_story: q.help_story ?? '',
      },
    });
  };

  const filtered = questions.filter((q) => {
    if (categoryFilter && q.theme !== categoryFilter) return false;
    if (search && !q.question.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const usedThemes = [...new Set(questions.map((q) => q.theme))].sort();

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Questions Battle Royal</h1>
        <button
          onClick={() => setModal({ open: true, editing: null })}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition"
        >
          <Plus className="w-4 h-4" />
          Ajouter une question
        </button>
      </div>

      {/* Difficulty tabs */}
      <div className="flex gap-2 mb-6">
        {DIFFICULTIES.map((d) => {
          const active = difficulty === d.key;
          return (
            <button
              key={d.key}
              onClick={() => switchDifficulty(d.key)}
              className={`flex-1 relative px-4 py-3 rounded-xl font-medium transition border-2 ${
                active
                  ? `${d.bg} ${d.color} border-current shadow-sm`
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className="text-base">{d.key}</span>
              <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold text-white ${d.badge}`}>
                {stats[d.key]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-72 flex-shrink-0 space-y-4">
          {/* AI Generation */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-purple-500 to-indigo-500 px-4 py-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Générer par IA
              </h3>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Catégorie</label>
                <select
                  value={genCategory}
                  onChange={(e) => setGenCategory(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="random">Aléatoire</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Indication <span className="text-gray-400">(facultatif)</span>
                </label>
                <input
                  type="text"
                  value={genHint}
                  onChange={(e) => setGenHint(e.target.value)}
                  placeholder="Ex: Marvel, années 80..."
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre (1-10)</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={genCount}
                  onChange={(e) => setGenCount(Number(e.target.value))}
                  className="w-20 px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm font-medium rounded-lg hover:from-purple-600 hover:to-indigo-600 transition disabled:opacity-50"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {generating ? 'Génération...' : 'Générer'}
              </button>
            </div>
          </div>

          {/* Import */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Download className="w-4 h-4" />
                Importer
              </h3>
            </div>
            <div className="p-4">
              <button
                onClick={handleImport}
                disabled={importing}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition disabled:opacity-50"
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {importing ? 'Import...' : 'Importer depuis le serveur'}
              </button>
              <p className="mt-2 text-xs text-gray-400">Les doublons seront ignorés automatiquement</p>
            </div>
          </div>

          {/* Clear */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-red-500 to-orange-500 px-4 py-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Zone dangereuse
              </h3>
            </div>
            <div className="p-4">
              <button
                onClick={handleClearDifficulty}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 border-2 border-red-300 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition"
              >
                <Trash2 className="w-4 h-4" />
                Vider "{difficulty}"
              </button>
            </div>
          </div>

          {/* Info */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gray-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Info className="w-4 h-4" />
                Informations
              </h3>
            </div>
            <div className="p-4 space-y-2 text-sm text-gray-600">
              <p><span className="font-medium">Total:</span> {stats.total} questions</p>
              <p><span className="font-medium">Catégories:</span> {categories.length}</p>
            </div>
          </div>
        </div>

        {/* Main list */}
        <div className="flex-1 min-w-0">
          {/* Filters bar */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher une question..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="pl-9 pr-8 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm appearance-none bg-white min-w-[180px]"
              >
                <option value="">Toutes catégories</option>
                {usedThemes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Questions count */}
          <p className="text-sm text-gray-500 mb-3">
            {filtered.length} question{filtered.length !== 1 ? 's' : ''}
            {(categoryFilter || search) && ` (sur ${questions.length})`}
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-lg">Aucune question trouvée</p>
              {(categoryFilter || search) && (
                <button
                  onClick={() => { setCategoryFilter(''); setSearch(''); }}
                  className="mt-2 text-sm text-primary-500 hover:underline"
                >
                  Réinitialiser les filtres
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((q) => {
                return (
                  <div
                    key={q.id}
                    className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-mono text-gray-400">#{q.id}</span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700">
                            {q.theme}
                          </span>
                        </div>
                        <p className="font-medium text-gray-900 mb-3">{q.question}</p>

                        <div className="flex flex-wrap gap-2 mb-2">
                          {q.answers.map((a, i) => {
                            const isCorrect = a.includes('(OK)');
                            const clean = a.replace(' (OK)', '');
                            const letter = String.fromCharCode(65 + i);
                            return (
                              <span
                                key={i}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${
                                  isCorrect
                                    ? 'bg-green-100 text-green-800 ring-1 ring-green-300'
                                    : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                <span className="font-semibold">{letter}.</span> {clean}
                              </span>
                            );
                          })}
                        </div>

                        {q.help_story && (
                          <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                            <p className="text-xs text-amber-800">
                              <span className="font-semibold">Anecdote:</span> {q.help_story}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={() => openEdit(q)}
                          className="p-1.5 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition"
                          title="Modifier"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(q.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {modal.open && (
        <BattleQuestionModal
          initial={modal.editing}
          categories={categories}
          currentDifficulty={difficulty}
          onSave={handleSave}
          onClose={() => setModal({ open: false, editing: null })}
        />
      )}
    </div>
  );
}
