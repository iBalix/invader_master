import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus, Trash2, Pencil, Sparkles, Search, X, Info, Loader2, Play,
  Archive, ArchiveRestore, List, FolderTree, ChevronDown, ChevronRight, Package,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import BattleQuestionModal, { type BattleQuestionData } from '../components/Battle/BattleQuestionModal';
import BattleGenerateModal, { type GenerateParams } from '../components/Battle/BattleGenerateModal';

interface Question {
  id: string;
  question: string;
  difficulty: string;
  theme: string;
  answers: string[];
  help_story: string;
  created_at: string;
  /** posée en soirée : la question est en ARCHIVE et ne ressort plus */
  used_at: string | null;
}

type Difficulty = 'Facile' | 'Moyen' | 'Difficile';

interface Stats {
  Facile: number;
  Moyen: number;
  Difficile: number;
  total: number;
  /** jamais posées (le stock) */
  available?: Record<Difficulty, number>;
  /** déjà posées (les archives) */
  used?: Record<Difficulty, number>;
}

/** stock = jamais posées, archives = déjà posées en soirée */
type Fonds = 'stock' | 'archives';
/** liste à plat, ou groupée par catégorie avec le compte de chacune */
type Vue = 'liste' | 'categories';

const DIFFICULTIES: { key: Difficulty; color: string; bg: string; badge: string }[] = [
  { key: 'Facile', color: 'text-green-700', bg: 'bg-green-50', badge: 'bg-green-500' },
  { key: 'Moyen', color: 'text-yellow-700', bg: 'bg-yellow-50', badge: 'bg-yellow-500' },
  { key: 'Difficile', color: 'text-red-700', bg: 'bg-red-50', badge: 'bg-red-500' },
];

const STATS_VIDES: Stats = {
  Facile: 0, Moyen: 0, Difficile: 0, total: 0,
  available: { Facile: 0, Moyen: 0, Difficile: 0 },
  used: { Facile: 0, Moyen: 0, Difficile: 0 },
};

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function BattleQuestionsPage() {
  const [difficulty, setDifficulty] = useState<Difficulty>('Facile');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [stats, setStats] = useState<Stats>(STATS_VIDES);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // filtres de la colonne de gauche : par défaut le STOCK, en liste
  const [fonds, setFonds] = useState<Fonds>('stock');
  const [vue, setVue] = useState<Vue>('liste');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  /** catégories repliées dans la vue groupée (tout est déplié par défaut) */
  const [replies, setReplies] = useState<Set<string>>(new Set());

  const [modal, setModal] = useState<{ open: boolean; editing: BattleQuestionData | null }>({ open: false, editing: null });
  const [genOpen, setGenOpen] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const { data } = await api.get('/api/battle-questions/stats');
      setStats({ ...STATS_VIDES, ...(data.stats ?? {}) });
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
      const liste = data.questions ?? data.items ?? [];
      setQuestions(Array.isArray(liste) ? liste : []);
    } catch {
      toast.error('Erreur de chargement des questions');
    }
  }, []);

  useEffect(() => {
    Promise.all([loadStats(), loadCategories(), loadQuestions(difficulty)]).finally(() => setLoading(false));
  }, [loadStats, loadCategories, loadQuestions, difficulty]);

  /** tout recharger après une écriture */
  const rafraichir = useCallback(() => {
    void loadQuestions(difficulty);
    void loadStats();
    void loadCategories();
  }, [difficulty, loadQuestions, loadStats, loadCategories]);

  const switchDifficulty = (d: Difficulty) => {
    if (d === difficulty) return;
    setDifficulty(d);
    setCategoryFilter('');
    setSearch('');
    setReplies(new Set());
    setLoading(true);
    loadQuestions(d).finally(() => setLoading(false));
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette question ?')) return;
    try {
      await api.delete(`/api/battle-questions/${id}`);
      toast.success('Question supprimée');
      rafraichir();
    } catch { toast.error('Erreur lors de la suppression'); }
  };

  /** archives -> stock, en un clic : la question ressortira en soirée */
  const handleRestore = async (id: string) => {
    try {
      await api.patch(`/api/battle-questions/${id}/usage`, { used: false });
      toast.success('Question remise en stock');
      rafraichir();
    } catch { toast.error('Impossible de remettre la question en stock'); }
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
      rafraichir();
    } catch { toast.error('Erreur lors de la sauvegarde'); }
  };

  const handleGenerate = async (params: GenerateParams) => {
    try {
      const { data } = await api.post('/api/battle-questions/generate', params);
      toast.success(data.message ?? 'Questions générées');
      setGenOpen(false);
      // les nouvelles questions arrivent en stock : on s'y place pour les voir
      setFonds('stock');
      if (params.difficulty !== difficulty) {
        switchDifficulty(params.difficulty as Difficulty);
        void loadStats();
        void loadCategories();
      } else {
        rafraichir();
      }
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast.error(msg ?? 'Erreur lors de la génération');
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

  // ── dérivés ──────────────────────────────────────────────────────────────

  /** les questions du fonds choisi (stock ou archives), avant les autres filtres */
  const dansLeFonds = useMemo(
    () => questions.filter((q) => (fonds === 'stock' ? !q.used_at : Boolean(q.used_at))),
    [questions, fonds],
  );

  /** compte par catégorie dans le fonds : affiché dans le sélecteur */
  const compteParCategorie = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of dansLeFonds) m.set(q.theme, (m.get(q.theme) ?? 0) + 1);
    return m;
  }, [dansLeFonds]);

  const recherche = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      dansLeFonds.filter((q) => {
        if (categoryFilter && q.theme !== categoryFilter) return false;
        if (!recherche) return true;
        return (
          q.question.toLowerCase().includes(recherche) ||
          q.theme.toLowerCase().includes(recherche) ||
          q.answers.some((a) => a.toLowerCase().includes(recherche))
        );
      }),
    [dansLeFonds, categoryFilter, recherche],
  );

  /** vue groupée : les catégories les plus fournies d'abord */
  const groupes = useMemo(() => {
    const m = new Map<string, Question[]>();
    for (const q of filtered) {
      const liste = m.get(q.theme) ?? [];
      liste.push(q);
      m.set(q.theme, liste);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [filtered]);

  const filtresActifs = Boolean(categoryFilter || recherche);
  const nbStock = stats.available?.[difficulty] ?? 0;
  const nbArchives = stats.used?.[difficulty] ?? 0;
  const enArchives = fonds === 'archives';

  const basculerRepli = (theme: string) => {
    setReplies((prev) => {
      const next = new Set(prev);
      if (next.has(theme)) next.delete(theme);
      else next.add(theme);
      return next;
    });
  };

  // ── rendu ────────────────────────────────────────────────────────────────

  const carte = (q: Question) => (
    <CarteQuestion
      key={q.id}
      q={q}
      archive={enArchives}
      onEdit={() => openEdit(q)}
      onDelete={() => void handleDelete(q.id)}
      onRestore={() => void handleRestore(q.id)}
    />
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Questions Battle Royal</h1>
        <div className="flex items-center gap-3">
          <a
            href="/evenements/battle-live"
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition"
          >
            <Play className="w-4 h-4" />
            Animer un Battle Royal
          </a>
          <button
            onClick={() => setModal({ open: true, editing: null })}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition"
          >
            <Plus className="w-4 h-4" />
            Ajouter une question
          </button>
        </div>
      </div>

      {/* Onglets de difficulté : le badge dit ce qu'il reste EN STOCK, le
          chiffre grisé ce qui a déjà été joué */}
      <div className="flex gap-2 mb-6">
        {DIFFICULTIES.map((d) => {
          const active = difficulty === d.key;
          const stock = stats.available?.[d.key] ?? stats[d.key];
          const archives = stats.used?.[d.key] ?? 0;
          return (
            <button
              key={d.key}
              onClick={() => switchDifficulty(d.key)}
              className={`flex-1 px-4 py-3 rounded-xl font-medium transition border-2 ${
                active
                  ? `${d.bg} ${d.color} border-current shadow-sm`
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className="text-base">{d.key}</span>
              <span
                className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold text-white ${d.badge}`}
                title="Questions en stock"
              >
                {stock}
              </span>
              <span className="ml-2 text-xs text-gray-400" title="Questions déjà jouées">
                {archives} archivée{archives !== 1 ? 's' : ''}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-6">
        {/* ── Colonne de gauche : recherche, filtres, génération ── */}
        <aside className="w-72 flex-shrink-0 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-4">
            {/* recherche */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2" title="Effacer">
                  <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>

            {/* stock / archives */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Fonds</p>
              <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-lg">
                <Segment
                  actif={fonds === 'stock'}
                  onClick={() => setFonds('stock')}
                  icone={<Package className="w-3.5 h-3.5" />}
                  label="Stock"
                  compte={nbStock}
                />
                <Segment
                  actif={fonds === 'archives'}
                  onClick={() => setFonds('archives')}
                  icone={<Archive className="w-3.5 h-3.5" />}
                  label="Archives"
                  compte={nbArchives}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-gray-400 leading-snug">
                {enArchives
                  ? 'Déjà posées en soirée : elles ne ressortent plus, sauf remise en stock.'
                  : 'Jamais posées : c’est là que le moteur pioche.'}
              </p>
            </div>

            {/* catégorie, avec le compte de chacune dans le fonds */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Catégorie</p>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm bg-white"
              >
                <option value="">Toutes ({dansLeFonds.length})</option>
                {categories.map((t) => (
                  <option key={t} value={t}>
                    {t} ({compteParCategorie.get(t) ?? 0})
                  </option>
                ))}
              </select>
            </div>

            {/* liste / par catégorie */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Affichage</p>
              <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-lg">
                <Segment
                  actif={vue === 'liste'}
                  onClick={() => setVue('liste')}
                  icone={<List className="w-3.5 h-3.5" />}
                  label="Liste"
                />
                <Segment
                  actif={vue === 'categories'}
                  onClick={() => setVue('categories')}
                  icone={<FolderTree className="w-3.5 h-3.5" />}
                  label="Par catégorie"
                />
              </div>
            </div>

            {filtresActifs && (
              <button
                onClick={() => { setCategoryFilter(''); setSearch(''); }}
                className="w-full text-sm text-primary-500 hover:underline text-left"
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>

          {/* génération IA : un bouton, le formulaire en pop-up */}
          <button
            onClick={() => setGenOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm font-medium rounded-xl shadow-sm hover:from-purple-600 hover:to-indigo-600 transition"
          >
            <Sparkles className="w-4 h-4" />
            Générer par IA
          </button>

          {/* repères */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-sm text-gray-600 space-y-1.5">
            <p className="flex items-center gap-2 font-semibold text-gray-700 mb-1">
              <Info className="w-4 h-4" /> Repères
            </p>
            <p>
              <span className="font-medium">{difficulty} :</span> {nbStock} en stock, {nbArchives} archivée{nbArchives !== 1 ? 's' : ''}
            </p>
            <p><span className="font-medium">Total :</span> {stats.total} questions</p>
            <p><span className="font-medium">Catégories :</span> {categories.length}</p>
          </div>
        </aside>

        {/* ── Liste ── */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-500 mb-3">
            {filtered.length} question{filtered.length !== 1 ? 's' : ''}
            {enArchives ? ' archivée' + (filtered.length !== 1 ? 's' : '') : ' en stock'}
            {filtresActifs && ` (sur ${dansLeFonds.length})`}
            {vue === 'categories' && groupes.length > 0 && ` · ${groupes.length} catégorie${groupes.length > 1 ? 's' : ''}`}
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              {filtresActifs ? (
                <>
                  <p className="text-lg">Aucune question ne correspond</p>
                  <button
                    onClick={() => { setCategoryFilter(''); setSearch(''); }}
                    className="mt-2 text-sm text-primary-500 hover:underline"
                  >
                    Réinitialiser les filtres
                  </button>
                </>
              ) : enArchives ? (
                <p className="text-lg">Aucune question {difficulty} n’a encore été jouée</p>
              ) : (
                <>
                  <p className="text-lg">Plus aucune question {difficulty} en stock</p>
                  <button
                    onClick={() => setGenOpen(true)}
                    className="mt-3 inline-flex items-center gap-2 text-sm text-primary-500 hover:underline"
                  >
                    <Sparkles className="w-4 h-4" /> Générer des questions
                  </button>
                </>
              )}
            </div>
          ) : vue === 'liste' ? (
            <div className="space-y-3">{filtered.map(carte)}</div>
          ) : (
            <div className="space-y-4">
              {groupes.map(([theme, liste]) => {
                const replie = replies.has(theme);
                return (
                  <section key={theme} className="bg-gray-50 rounded-xl border border-gray-100">
                    <button
                      onClick={() => basculerRepli(theme)}
                      className="w-full flex items-center gap-2 px-4 py-3 text-left"
                    >
                      {replie ? (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                      <span className="font-semibold text-gray-800">{theme}</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-100 text-primary-700">
                        {liste.length}
                      </span>
                    </button>
                    {!replie && <div className="px-3 pb-3 space-y-3">{liste.map(carte)}</div>}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {modal.open && (
        <BattleQuestionModal
          initial={modal.editing}
          categories={categories}
          currentDifficulty={difficulty}
          onSave={handleSave}
          onClose={() => setModal({ open: false, editing: null })}
        />
      )}

      {genOpen && (
        <BattleGenerateModal
          categories={categories}
          currentDifficulty={difficulty}
          onGenerate={handleGenerate}
          onClose={() => setGenOpen(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Segment({
  actif,
  onClick,
  icone,
  label,
  compte,
}: {
  actif: boolean;
  onClick: () => void;
  icone: React.ReactNode;
  label: string;
  compte?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition ${
        actif ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {icone}
      {label}
      {compte !== undefined && (
        <span className={`tabular-nums ${actif ? 'text-gray-500' : 'text-gray-400'}`}>{compte}</span>
      )}
    </button>
  );
}

function CarteQuestion({
  q,
  archive,
  onEdit,
  onDelete,
  onRestore,
}: {
  q: Question;
  archive: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition group">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono text-gray-400">#{q.id.slice(0, 8)}</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700">
              {q.theme}
            </span>
            {archive && q.used_at && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                <Archive className="w-3 h-3" /> jouée le {dateCourte(q.used_at)}
              </span>
            )}
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
                <span className="font-semibold">Anecdote :</span> {q.help_story}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* En archive, la remise en stock est L'action : toujours visible,
              un clic, pas de confirmation (c'est réversible). */}
          {archive && (
            <button
              onClick={onRestore}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition"
              title="Remettre cette question en stock"
            >
              <ArchiveRestore className="w-4 h-4" />
              Remettre en stock
            </button>
          )}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
            <button
              onClick={onEdit}
              className="p-1.5 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition"
              title="Modifier"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
              title="Supprimer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
