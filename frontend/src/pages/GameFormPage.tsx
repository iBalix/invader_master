import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import FileUpload from '../components/Quiz/FileUpload';

interface GameForm {
  name: string;
  subtitle: string;
  description: string;
  file_name: string;
  console_id: string;
  platform: string[];
  display_order: number;
  competition: boolean;
  competition_link: string;
}

interface ConsoleOption { id: string; name: string; }
interface CategoryOption { id: string; name: string; }

const EMPTY: GameForm = {
  name: '',
  subtitle: '',
  description: '',
  file_name: '',
  console_id: '',
  platform: [],
  display_order: 100,
  competition: false,
  competition_link: '',
};

const PLATFORM_OPTIONS = ['Table', 'Borne', 'Salon'];

export default function GameFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [form, setForm] = useState<GameForm>({ ...EMPTY });
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [allConsoles, setAllConsoles] = useState<ConsoleOption[]>([]);
  const [allCategories, setAllCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof GameForm>(key: K, val: GameForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const togglePlatform = (p: string) => {
    setForm((prev) => ({
      ...prev,
      platform: prev.platform.includes(p)
        ? prev.platform.filter((x) => x !== p)
        : [...prev.platform, p],
    }));
  };

  const toggleCategory = (catId: string) => {
    setCategoryIds((prev) =>
      prev.includes(catId) ? prev.filter((x) => x !== catId) : [...prev, catId],
    );
  };

  const loadGame = useCallback(async () => {
    if (!id) { setLoading(false); return; }
    try {
      const { data } = await api.get(`/api/games/${id}`);
      const g = data.game;
      setForm({
        name: g.name ?? '',
        subtitle: g.subtitle ?? '',
        description: g.description ?? '',
        file_name: g.file_name ?? '',
        console_id: g.console_id ?? '',
        platform: g.platform ?? [],
        display_order: g.display_order ?? 100,
        competition: g.competition ?? false,
        competition_link: g.competition_link ?? '',
      });
      setCoverUrl(g.cover_url ?? null);
      setImages((g.images ?? []).map((img: { image_url: string }) => img.image_url));
      setCategoryIds(g.category_ids ?? []);
    } catch {
      toast.error('Jeu introuvable');
      navigate('/contenus/jeux');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { loadGame(); }, [loadGame]);

  useEffect(() => {
    api.get('/api/game-consoles').then(({ data }) =>
      setAllConsoles((data.items ?? []).map((c: ConsoleOption) => ({ id: c.id, name: c.name }))),
    );
    api.get('/api/game-categories').then(({ data }) =>
      setAllCategories((data.items ?? []).map((c: CategoryOption) => ({ id: c.id, name: c.name }))),
    );
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.file_name.trim() || !form.console_id) {
      toast.error('Nom, nom fichier et console requis');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        subtitle: form.subtitle || null,
        description: form.description || null,
        competition_link: form.competition_link || null,
        cover_url: coverUrl,
        images,
        category_ids: categoryIds,
      };

      if (isEdit) {
        await api.put(`/api/games/${id}`, payload);
        toast.success('Jeu mis à jour');
      } else {
        const { data } = await api.post('/api/games', payload);
        toast.success('Jeu créé');
        navigate(`/contenus/jeux/game/${data.game.id}`, { replace: true });
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const addImage = (url: string | null) => {
    if (url) setImages((prev) => [...prev, url]);
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
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
        onClick={() => navigate('/contenus/jeux')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" /> Retour aux jeux
      </button>

      <h1 className="text-2xl font-bold mb-6">
        {isEdit ? 'Modifier le jeu' : 'Nouveau jeu'}
      </h1>

      <form onSubmit={handleSave} className="space-y-8">
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-lg font-semibold mb-2">Informations</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
              <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sous-titre</label>
              <input type="text" value={form.subtitle} onChange={(e) => set('subtitle', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom fichier *</label>
              <input type="text" value={form.file_name} onChange={(e) => set('file_name', e.target.value)}
                placeholder="Ex : street_fighter_2"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm" required />
              <p className="mt-1 text-xs text-gray-400">Nom du fichier ROM / dossier du jeu</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Console *</label>
              <select value={form.console_id} onChange={(e) => set('console_id', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" required>
                <option value="">— Sélectionner —</option>
                {allConsoles.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ordre d'affichage</label>
              <input type="number" value={form.display_order} onChange={(e) => set('display_order', parseInt(e.target.value) || 100)}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
              <p className="mt-1 text-xs text-gray-400">Tri croissant : les valeurs les plus basses apparaissent en premier</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Plateformes</label>
              <div className="flex gap-3">
                {PLATFORM_OPTIONS.map((p) => (
                  <label key={p} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.platform.includes(p)} onChange={() => togglePlatform(p)}
                      className="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500" />
                    <span className="text-sm text-gray-700">{p}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <button type="button" onClick={() => set('competition', !form.competition)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${form.competition ? 'bg-primary-500' : 'bg-gray-300'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${form.competition ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <span className="text-sm text-gray-700">Mode compétition</span>
            </label>
          </div>

          {form.competition && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lien compétition</label>
              <input type="url" value={form.competition_link} onChange={(e) => set('competition_link', e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-lg font-semibold mb-2">Médias</h2>

          <div>
            <FileUpload label="Jaquette (cover)" accept="image/*" value={coverUrl} onChange={(v) => setCoverUrl(v)} />
            <p className="mt-1 text-xs text-gray-400">Minimum 388 x 319 px</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Images supplémentaires ({images.length})
            </label>
            <div className="space-y-2">
              {images.map((url, idx) => (
                <div key={idx} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg border border-gray-200">
                  <img src={url} alt="" className="w-16 h-10 rounded object-cover flex-shrink-0" />
                  <span className="text-xs text-gray-500 truncate flex-1">{url.split('/').pop()}</span>
                  <button type="button" onClick={() => removeImage(idx)} className="p-1 text-gray-400 hover:text-red-500">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2">
              <FileUpload label="" accept="image/*" value={null} onChange={addImage} />
              <p className="mt-1 text-xs text-gray-400">Minimum 1280 x 720 px</p>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold mb-4">Catégories</h2>
          {allCategories.length === 0 ? (
            <p className="text-sm text-gray-400">Aucune catégorie disponible</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {allCategories.map((c) => (
                <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={categoryIds.includes(c.id)} onChange={() => toggleCategory(c.id)}
                    className="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500" />
                  <span className="text-sm text-gray-700">{c.name}</span>
                </label>
              ))}
            </div>
          )}
        </section>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate('/contenus/jeux')}
            className="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
            Annuler
          </button>
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition disabled:opacity-50">
            {saving ? 'Enregistrement...' : isEdit ? 'Enregistrer' : 'Créer le jeu'}
          </button>
        </div>
      </form>
    </div>
  );
}
