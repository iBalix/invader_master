import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import GameCategoryModal, { type GameCategoryData } from '../components/Games/GameCategoryModal';
import GameConsoleModal, { type GameConsoleData } from '../components/Games/GameConsoleModal';

interface GameRow {
  id: string;
  name: string;
  cover_url: string | null;
  console_name: string | null;
  platform: string[];
  display_order: number;
  categories: string[];
  competition: boolean;
}

interface CategoryRow {
  id: string;
  name: string;
  name_en: string;
  display_order: number;
  gameCount: number;
}

interface ConsoleRow {
  id: string;
  name: string;
  library: string;
  logo_url: string | null;
  gameCount: number;
}

type Tab = 'games' | 'categories' | 'consoles';

export default function GamesListPage() {
  const [tab, setTab] = useState<Tab>('games');
  const [games, setGames] = useState<GameRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [consoles, setConsoles] = useState<ConsoleRow[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [catModal, setCatModal] = useState<{ open: boolean; editing: GameCategoryData | null }>({ open: false, editing: null });
  const [consoleModal, setConsoleModal] = useState<{ open: boolean; editing: GameConsoleData | null }>({ open: false, editing: null });

  const loadGames = useCallback(async () => {
    try {
      const { data } = await api.get('/api/games');
      setGames(data.items ?? []);
    } catch { toast.error('Erreur de chargement des jeux'); }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const { data } = await api.get('/api/game-categories');
      setCategories(data.items ?? []);
    } catch { toast.error('Erreur de chargement des catégories'); }
  }, []);

  const loadConsoles = useCallback(async () => {
    try {
      const { data } = await api.get('/api/game-consoles');
      setConsoles(data.items ?? []);
    } catch { toast.error('Erreur de chargement des consoles'); }
  }, []);

  useEffect(() => {
    Promise.all([loadGames(), loadCategories(), loadConsoles()]).finally(() => setLoading(false));
  }, [loadGames, loadCategories, loadConsoles]);

  const handleDeleteGame = async (id: string, name: string) => {
    if (!confirm(`Supprimer le jeu "${name}" ?`)) return;
    try {
      await api.delete(`/api/games/${id}`);
      toast.success('Jeu supprimé');
      loadGames();
    } catch { toast.error('Erreur lors de la suppression'); }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    if (!confirm(`Supprimer la catégorie "${name}" ?`)) return;
    try {
      await api.delete(`/api/game-categories/${id}`);
      toast.success('Catégorie supprimée');
      loadCategories();
    } catch { toast.error('Erreur lors de la suppression'); }
  };

  const handleDeleteConsole = async (id: string, name: string) => {
    if (!confirm(`Supprimer la console "${name}" ?`)) return;
    try {
      await api.delete(`/api/game-consoles/${id}`);
      toast.success('Console supprimée');
      loadConsoles();
    } catch { toast.error('Erreur lors de la suppression'); }
  };

  const handleCategorySave = async (data: GameCategoryData) => {
    try {
      if (data.id) {
        await api.put(`/api/game-categories/${data.id}`, data);
        toast.success('Catégorie mise à jour');
      } else {
        await api.post('/api/game-categories', data);
        toast.success('Catégorie créée');
      }
      setCatModal({ open: false, editing: null });
      loadCategories();
    } catch { toast.error('Erreur lors de la sauvegarde'); }
  };

  const handleConsoleSave = async (data: GameConsoleData) => {
    try {
      if (data.id) {
        await api.put(`/api/game-consoles/${data.id}`, data);
        toast.success('Console mise à jour');
      } else {
        await api.post('/api/game-consoles', data);
        toast.success('Console créée');
      }
      setConsoleModal({ open: false, editing: null });
      loadConsoles();
    } catch { toast.error('Erreur lors de la sauvegarde'); }
  };

  const toggleCategory = (name: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const filteredGames = games.filter((g) => {
    if (search && !g.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedCategories.size > 0 && !g.categories.some((c) => selectedCategories.has(c))) return false;
    return true;
  });

  const createButton = () => {
    if (tab === 'games') {
      return (
        <Link
          to="/contenus/jeux/game/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition"
        >
          <Plus className="w-4 h-4" />
          Créer un jeu
        </Link>
      );
    }
    if (tab === 'categories') {
      return (
        <button
          onClick={() => setCatModal({ open: true, editing: null })}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition"
        >
          <Plus className="w-4 h-4" />
          Créer une catégorie
        </button>
      );
    }
    return (
      <button
        onClick={() => setConsoleModal({ open: true, editing: null })}
        className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition"
      >
        <Plus className="w-4 h-4" />
        Créer une console
      </button>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Jeux</h1>
        <div className="flex items-center gap-2">
          {createButton()}
        </div>
      </div>

      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {(['games', 'categories', 'consoles'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'games' ? `Jeux (${games.length})` : t === 'categories' ? `Catégories (${categories.length})` : `Consoles (${consoles.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500">Chargement...</p>
      ) : tab === 'games' ? (
        <>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher un jeu..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {categories.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider mr-1">Filtrer :</span>
              {categories.map((c) => {
                const active = selectedCategories.has(c.name);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCategory(c.name)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition ${
                      active
                        ? 'bg-primary-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {c.name}
                    {active && <X className="w-3 h-3" />}
                  </button>
                );
              })}
              {selectedCategories.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedCategories(new Set())}
                  className="text-xs text-gray-400 hover:text-gray-600 underline ml-1"
                >
                  Tout afficher
                </button>
              )}
            </div>
          )}

          {filteredGames.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-lg">Aucun jeu trouvé</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-3">Jeu</th>
                    <th className="px-6 py-3">Console</th>
                    <th className="px-6 py-3">Plateforme(s)</th>
                    <th className="px-6 py-3">Catégories</th>
                    <th className="px-6 py-3 text-center">Ordre</th>
                    <th className="px-6 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredGames.map((g) => (
                    <tr key={g.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 font-medium">
                        <Link
                          to={`/contenus/jeux/game/${g.id}`}
                          className="flex items-center gap-3 text-primary-600 hover:underline"
                        >
                          {g.cover_url ? (
                            <img src={g.cover_url} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded bg-gray-100 flex-shrink-0" />
                          )}
                          {g.name}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-gray-600 text-sm">{g.console_name ?? '—'}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {g.platform.length > 0
                            ? g.platform.map((p, i) => (
                                <span key={i} className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">{p}</span>
                              ))
                            : <span className="text-xs text-gray-400">—</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {g.categories.length > 0
                            ? g.categories.map((c, i) => (
                                <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{c}</span>
                              ))
                            : <span className="text-xs text-gray-400">—</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center text-gray-500 text-sm">{g.display_order}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Link to={`/contenus/jeux/game/${g.id}`} className="p-1.5 text-gray-400 hover:text-primary-500 transition" title="Modifier">
                            <Pencil className="w-4 h-4" />
                          </Link>
                          <button onClick={() => handleDeleteGame(g.id, g.name)} className="p-1.5 text-gray-400 hover:text-red-500 transition" title="Supprimer">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : tab === 'categories' ? (
        categories.length === 0 ? (
          <div className="text-center py-12 text-gray-400"><p className="text-lg">Aucune catégorie</p></div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-3">Nom</th>
                  <th className="px-6 py-3 text-center">Ordre</th>
                  <th className="px-6 py-3 text-center">Jeux</th>
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {categories.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 font-medium">{c.name}</td>
                    <td className="px-6 py-4 text-center text-gray-500 text-sm">{c.display_order}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{c.gameCount}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setCatModal({ open: true, editing: c })} className="p-1.5 text-gray-400 hover:text-primary-500 transition" title="Modifier">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteCategory(c.id, c.name)} className="p-1.5 text-gray-400 hover:text-red-500 transition" title="Supprimer">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        consoles.length === 0 ? (
          <div className="text-center py-12 text-gray-400"><p className="text-lg">Aucune console</p></div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-3">Console</th>
                  <th className="px-6 py-3">Library</th>
                  <th className="px-6 py-3 text-center">Jeux</th>
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {consoles.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 font-medium">
                      <div className="flex items-center gap-3">
                        {c.logo_url ? (
                          <img src={c.logo_url} alt="" className="w-8 h-8 rounded object-contain flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-gray-100 flex-shrink-0" />
                        )}
                        {c.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-sm font-mono">{c.library}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{c.gameCount}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setConsoleModal({ open: true, editing: c })} className="p-1.5 text-gray-400 hover:text-primary-500 transition" title="Modifier">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteConsole(c.id, c.name)} className="p-1.5 text-gray-400 hover:text-red-500 transition" title="Supprimer">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {catModal.open && (
        <GameCategoryModal
          initial={catModal.editing}
          onSave={handleCategorySave}
          onClose={() => setCatModal({ open: false, editing: null })}
        />
      )}

      {consoleModal.open && (
        <GameConsoleModal
          initial={consoleModal.editing}
          onSave={handleConsoleSave}
          onClose={() => setConsoleModal({ open: false, editing: null })}
        />
      )}

    </div>
  );
}
