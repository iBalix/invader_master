import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, Search, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import ImportQuizModal from '../components/Quiz/ImportQuizModal';

interface QuizRow {
  id: string;
  name: string;
  theme: string;
  published: boolean;
  questionCount: number;
  created_at: string;
}

export default function QuizListPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'salarie';
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get('/api/quizzes');
      setQuizzes(data.items ?? []);
    } catch {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Supprimer le quiz "${name}" ?`)) return;
    try {
      await api.delete(`/api/quizzes/${id}?deleteOrphans=true`);
      toast.success('Quiz supprimé');
      load();
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  const filtered = quizzes.filter(
    (q) =>
      q.name.toLowerCase().includes(search.toLowerCase()) ||
      q.theme.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Quiz</h1>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              <Download className="w-4 h-4" />
              Importer un quiz
            </button>
            <Link
              to="/contenus/quiz/new"
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition"
            >
              <Plus className="w-4 h-4" />
              Créer un quiz
            </Link>
          </div>
        )}
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Rechercher par nom ou thème..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>

      {loading ? (
        <p className="text-gray-500">Chargement...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">Aucun quiz trouvé</p>
          {canEdit && (
            <Link to="/contenus/quiz/new" className="text-primary-500 hover:underline mt-2 inline-block">
              Créer votre premier quiz
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">Nom</th>
                <th className="px-6 py-3">Thème</th>
                <th className="px-6 py-3 text-center">Questions</th>
                <th className="px-6 py-3 text-center">Statut</th>
                <th className="px-6 py-3 text-center">Créé le</th>
                {canEdit && <th className="px-6 py-3">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((q) => (
                <tr key={q.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4 font-medium">
                    <Link to={`/contenus/quiz/${q.id}`} className="text-primary-600 hover:underline">
                      {q.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{q.theme}</td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {q.questionCount}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      q.published
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {q.published ? 'Publié' : 'Draft'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-gray-500 text-sm">
                    {new Date(q.created_at).toLocaleDateString('fr-FR')}
                  </td>
                  {canEdit && (
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/contenus/quiz/${q.id}`}
                          className="p-1.5 text-gray-400 hover:text-primary-500 transition"
                          title="Modifier"
                        >
                          <Pencil className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => handleDelete(q.id, q.name)}
                          className="p-1.5 text-gray-400 hover:text-red-500 transition"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {importOpen && (
        <ImportQuizModal
          onClose={() => setImportOpen(false)}
          onImported={load}
        />
      )}
    </div>
  );
}
