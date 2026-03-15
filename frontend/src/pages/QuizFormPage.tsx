import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Search, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import FileUpload from '../components/Quiz/FileUpload';
import QuestionList from '../components/Quiz/QuestionList';
import QuestionModal, { type QuestionData } from '../components/Quiz/QuestionModal';

interface QuizForm {
  name: string;
  theme: string;
  background_media_youtube: string;
  background_music_url: string | null;
  background_image_url: string | null;
  pause_promotional_text: string;
  end_winner_text: string;
  end_text_final: string;
  published: boolean;
  do_not_delete: boolean;
}

const EMPTY_QUIZ: QuizForm = {
  name: '',
  theme: '',
  background_media_youtube: '',
  background_music_url: null,
  background_image_url: null,
  pause_promotional_text: '',
  end_winner_text: '',
  end_text_final: '',
  published: true,
  do_not_delete: false,
};

export default function QuizFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [form, setForm] = useState<QuizForm>({ ...EMPTY_QUIZ });
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [lastEditor, setLastEditor] = useState<{ email: string; at: string } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [modalSaving, setModalSaving] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<QuestionData[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const set = <K extends keyof QuizForm>(key: K, val: QuizForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const loadQuiz = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await api.get(`/api/quizzes/${id}`);
      const q = data.quiz;
      setForm({
        name: q.name ?? '',
        theme: q.theme ?? '',
        background_media_youtube: q.background_media_youtube ?? '',
        background_music_url: q.background_music_url ?? null,
        background_image_url: q.background_image_url ?? null,
        pause_promotional_text: q.pause_promotional_text ?? '',
        end_winner_text: q.end_winner_text ?? '',
        end_text_final: q.end_text_final ?? '',
        published: q.published ?? true,
        do_not_delete: q.do_not_delete ?? false,
      });
      if (q.last_edited_by_email) {
        setLastEditor({ email: q.last_edited_by_email, at: q.updated_at });
      }
      setQuestions(
        (q.questions ?? []).map((qn: Record<string, unknown>) => ({
          id: qn.id,
          question: qn.question ?? '',
          difficulty: qn.difficulty ?? [],
          answers: qn.answers ?? [],
          correct_answer_index: qn.correct_answer_index ?? 0,
          help_animator: qn.help_animator ?? '',
          music_url: qn.music_url ?? null,
          video_youtube: qn.video_youtube ?? '',
          image_question_url: qn.image_question_url ?? null,
          image_answer_url: qn.image_answer_url ?? null,
        }))
      );
    } catch {
      toast.error('Quiz introuvable');
      navigate('/contenus/quiz');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { loadQuiz(); }, [loadQuiz]);

  const togglePublished = async () => {
    const next = !form.published;
    set('published', next);
    if (isEdit) {
      try {
        await api.put(`/api/quizzes/${id}`, { published: next });
        toast.success(next ? 'Quiz publié' : 'Quiz passé en draft');
      } catch {
        set('published', !next);
        toast.error('Erreur lors du changement de statut');
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.theme.trim()) {
      toast.error('Nom et thème requis');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        background_media_youtube: form.background_media_youtube || null,
        pause_promotional_text: form.pause_promotional_text || null,
        end_winner_text: form.end_winner_text || null,
        end_text_final: form.end_text_final || null,
        questions: questions.map((q) => q.id).filter(Boolean),
      };

      if (isEdit) {
        await api.put(`/api/quizzes/${id}`, payload);
        toast.success('Quiz mis à jour');
      } else {
        const { data } = await api.post('/api/quizzes', payload);
        toast.success('Quiz créé');
        navigate(`/contenus/quiz/${data.quiz.id}`, { replace: true });
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const openNewQuestion = () => {
    setEditingIdx(null);
    setModalOpen(true);
  };

  const openEditQuestion = (idx: number) => {
    setEditingIdx(idx);
    setModalOpen(true);
  };

  const handleQuestionSave = async (data: QuestionData) => {
    setModalSaving(true);
    try {
      if (data.id) {
        const { data: res } = await api.put(`/api/questions/${data.id}`, data);
        const updated = res.question;
        setQuestions((prev) =>
          prev.map((q) => (q.id === updated.id ? { ...data, ...updated } : q))
        );
        toast.success('Question mise à jour');
      } else {
        const payload = isEdit ? { ...data, quiz_id: id } : data;
        const { data: res } = await api.post('/api/questions', payload);
        const created = { ...data, ...res.question };
        setQuestions((prev) => [...prev, created]);
        toast.success('Question créée');
      }
      setModalOpen(false);
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setModalSaving(false);
    }
  };

  const handleRemoveQuestion = (idx: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleMoveQuestion = (from: number, to: number) => {
    if (to < 0 || to >= questions.length) return;
    setQuestions((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const handleSearchExisting = useCallback(async (query?: string) => {
    setSearchLoading(true);
    try {
      const params: Record<string, string> = {};
      const q = (query ?? searchQuery).trim();
      if (q) params.search = q;
      const { data } = await api.get('/api/questions', { params });
      setSearchResults(data.items ?? []);
    } catch {
      toast.error('Erreur de recherche');
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery]);

  const addExistingQuestion = (q: QuestionData) => {
    setQuestions((prev) => [...prev, q]);
    toast.success('Question ajoutée');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <button
        onClick={() => navigate('/contenus/quiz')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" /> Retour à la liste
      </button>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">{isEdit ? 'Modifier le quiz' : 'Nouveau quiz'}</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePublished}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                form.published ? 'bg-green-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                  form.published ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className={`text-sm font-medium ${form.published ? 'text-green-600' : 'text-gray-500'}`}>
              {form.published ? 'Publié' : 'Draft'}
            </span>
          </div>
        </div>
        {isEdit && lastEditor && (
          <div className="text-right text-xs text-gray-400">
            <p>Dernière modification par <span className="font-medium text-gray-600">{lastEditor.email}</span></p>
            <p>{new Date(lastEditor.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-lg font-semibold mb-2">Informations</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Thème (pour prompt IA) *</label>
              <input
                type="text"
                value={form.theme}
                onChange={(e) => set('theme', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vidéo de fond (YouTube)</label>
            <input
              type="text"
              value={form.background_media_youtube}
              onChange={(e) => set('background_media_youtube', e.target.value)}
              placeholder="Ex : dQw4w9WgXcQ ou dQw4w9WgXcQ?start=30"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
            />
            <p className="mt-1 text-xs text-gray-400">
              ID YouTube (partie après v= dans l'URL). Optionnel : ajouter ?start=X pour demarrer a X secondes
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FileUpload
              label="Image de fond *"
              accept="image/*"
              value={form.background_image_url}
              onChange={(v) => set('background_image_url', v)}
            />
            <FileUpload
              label="Musique de fond"
              accept="audio/*"
              value={form.background_music_url}
              onChange={(v) => set('background_music_url', v)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Texte promo pause</label>
            <input
              type="text"
              value={form.pause_promotional_text}
              onChange={(e) => set('pause_promotional_text', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Récompense fin</label>
            <input
              type="text"
              value={form.end_winner_text}
              onChange={(e) => set('end_winner_text', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Texte final</label>
            <input
              type="text"
              value={form.end_text_final}
              onChange={(e) => set('end_text_final', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.do_not_delete}
              onChange={(e) => set('do_not_delete', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700">Ne pas supprimer automatiquement</span>
          </label>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              Questions <span className="text-gray-400 font-normal">({questions.length})</span>
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const next = !searchOpen;
                  setSearchOpen(next);
                  setSearchQuery('');
                  setSearchResults([]);
                  if (next) handleSearchExisting('');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                <Search className="w-3.5 h-3.5" /> Ajouter existante
              </button>
              <button
                type="button"
                onClick={openNewQuestion}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition"
              >
                <Plus className="w-3.5 h-3.5" /> Créer une question
              </button>
            </div>
          </div>

          {searchOpen && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearchExisting();
                    }
                  }}
                  placeholder="Rechercher une question..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                />
                <button
                  type="button"
                  onClick={() => handleSearchExisting()}
                  disabled={searchLoading}
                  className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition text-sm disabled:opacity-50"
                >
                  {searchLoading ? 'Recherche...' : 'Rechercher'}
                </button>
              </div>
              {searchResults.length > 0 && (() => {
                const existingIds = new Set(questions.map((q) => q.id));
                return (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {searchResults.map((q) => {
                      const alreadyAdded = existingIds.has(q.id);
                      return (
                        <div
                          key={q.id}
                          className={`flex items-center justify-between p-2 rounded border transition ${
                            alreadyAdded ? 'bg-gray-100 border-gray-200 opacity-60' : 'bg-white hover:border-primary-300'
                          }`}
                        >
                          <span className="text-sm truncate flex-1">{q.question}</span>
                          {alreadyAdded ? (
                            <span className="ml-2 px-2 py-1 text-xs text-gray-400">Déjà ajoutée</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => addExistingQuestion(q)}
                              className="ml-2 px-2 py-1 text-xs bg-primary-500 text-white rounded hover:bg-primary-600 transition"
                            >
                              Ajouter
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              {searchResults.length === 0 && !searchLoading && (
                <p className="text-sm text-gray-400">
                  {searchQuery ? 'Aucune question ne correspond à la recherche' : 'Aucune question disponible'}
                </p>
              )}
            </div>
          )}

          <QuestionList
            questions={questions}
            onEdit={openEditQuestion}
            onRemove={handleRemoveQuestion}
            onMove={handleMoveQuestion}
          />
        </section>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/contenus/quiz')}
            className="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition disabled:opacity-50"
          >
            {saving ? 'Enregistrement...' : isEdit ? 'Enregistrer' : 'Créer le quiz'}
          </button>
        </div>
      </form>

      {modalOpen && (
        <QuestionModal
          initial={editingIdx !== null ? questions[editingIdx] : null}
          onSave={handleQuestionSave}
          onClose={() => setModalOpen(false)}
          saving={modalSaving}
        />
      )}
    </div>
  );
}
