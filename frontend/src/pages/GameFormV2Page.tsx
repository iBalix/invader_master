import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, X, Youtube } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import FileUpload from '../components/Quiz/FileUpload';

interface GameForm {
  name: string;
  name_en: string;
  subtitle: string;
  subtitle_en: string;
  description: string;
  description_en: string;
  /** 'emulator' = ROM lancée par l'agent ; 'web' = route interne du SPA tables */
  game_type: 'emulator' | 'web';
  game_url: string;
  file_name: string;
  console_id: string;
  platform: string[];
  display_order: number;
  competition: boolean;
  competition_link: string;
  max_players: number;
  youtube_url: string;
  youtube_video_id: string | null;
  youtube_start_sec: number;
  youtube_duration_sec: number | null;
  control_a: string;
  control_b: string;
  control_x: string;
  control_y: string;
  control_l: string;
  control_r: string;
  control_start: string;
  control_select: string;
  special_note: string;
}

interface ConsoleOption { id: string; name: string; display_name: string | null; }
interface CategoryOption { id: string; name: string; }

const EMPTY: GameForm = {
  name: '',
  name_en: '',
  subtitle: '',
  subtitle_en: '',
  description: '',
  description_en: '',
  game_type: 'emulator',
  game_url: '',
  file_name: '',
  console_id: '',
  platform: [],
  display_order: 100,
  competition: false,
  competition_link: '',
  max_players: 1,
  youtube_url: '',
  youtube_video_id: null,
  youtube_start_sec: 0,
  youtube_duration_sec: null,
  control_a: '',
  control_b: '',
  control_x: '',
  control_y: '',
  control_l: '',
  control_r: '',
  control_start: '',
  control_select: '',
  special_note: '',
};

const PLATFORM_OPTIONS = ['Table', 'Borne', 'Salon'];

const CONTROL_FIELDS: { key: keyof GameForm; label: string }[] = [
  { key: 'control_a', label: 'A' },
  { key: 'control_b', label: 'B' },
  { key: 'control_x', label: 'X' },
  { key: 'control_y', label: 'Y' },
  { key: 'control_l', label: 'L' },
  { key: 'control_r', label: 'R' },
  { key: 'control_start', label: 'Start' },
  { key: 'control_select', label: 'Select' },
];

/**
 * Parse une URL YouTube et retourne le video_id, ou null si invalide.
 * Supporte : youtu.be/XXX, youtube.com/watch?v=XXX, youtube.com/embed/XXX
 */
function parseYoutubeId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  // Si déjà un ID brut (11 chars alphanumériques + _ -)
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/watch\?(?:.*&)?v=([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m) return m[1];
  }
  return null;
}

export default function GameFormV2Page() {
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

  const onYoutubeUrlChange = (url: string) => {
    const videoId = parseYoutubeId(url);
    setForm((prev) => ({ ...prev, youtube_url: url, youtube_video_id: videoId }));
  };

  const loadGame = useCallback(async () => {
    if (!id) { setLoading(false); return; }
    try {
      const { data } = await api.get(`/api/games-v2/${id}`);
      const g = data.game;
      const videoId = g.youtube_video_id ?? null;
      setForm({
        name: g.name ?? '',
        name_en: g.name_en ?? '',
        subtitle: g.subtitle ?? '',
        subtitle_en: g.subtitle_en ?? '',
        description: g.description ?? '',
        description_en: g.description_en ?? '',
        game_type: g.game_type === 'web' ? 'web' : 'emulator',
        game_url: g.game_url ?? '',
        file_name: g.file_name ?? '',
        console_id: g.console_id ?? '',
        platform: g.platform ?? [],
        display_order: g.display_order ?? 100,
        competition: g.competition ?? false,
        competition_link: g.competition_link ?? '',
        max_players: g.max_players ?? 1,
        youtube_url: videoId ? `https://youtu.be/${videoId}` : '',
        youtube_video_id: videoId,
        youtube_start_sec: g.youtube_start_sec ?? 0,
        youtube_duration_sec: g.youtube_duration_sec ?? null,
        control_a: g.control_a ?? '',
        control_b: g.control_b ?? '',
        control_x: g.control_x ?? '',
        control_y: g.control_y ?? '',
        control_l: g.control_l ?? '',
        control_r: g.control_r ?? '',
        control_start: g.control_start ?? '',
        control_select: g.control_select ?? '',
        special_note: g.special_note ?? '',
      });
      setCoverUrl(g.cover_url ?? null);
      setImages((g.images ?? []).map((img: { image_url: string }) => img.image_url));
      setCategoryIds(g.category_ids ?? []);
    } catch {
      toast.error('Jeu introuvable');
      navigate('/contenus/jeux-v2');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { loadGame(); }, [loadGame]);

  useEffect(() => {
    api.get('/api/game-consoles-v2').then(({ data }) =>
      setAllConsoles((data.items ?? []).map((c: ConsoleOption) => ({
        id: c.id,
        name: c.name,
        display_name: c.display_name,
      }))),
    );
    api.get('/api/game-categories-v2').then(({ data }) =>
      setAllCategories((data.items ?? []).map((c: CategoryOption) => ({ id: c.id, name: c.name }))),
    );
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Nom requis');
      return;
    }
    if (form.game_type === 'web') {
      // un jeu web n'a ni ROM ni console : il lui faut une route interne
      if (!form.game_url.trim().startsWith('/table/')) {
        toast.error('Un jeu web exige une URL interne commençant par /table/');
        return;
      }
    } else if (!form.file_name.trim() || !form.console_id) {
      toast.error('Nom fichier et console requis');
      return;
    }
    if (form.youtube_url && !form.youtube_video_id) {
      toast.error('URL YouTube invalide');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name,
        name_en: form.name_en,
        subtitle: form.subtitle || null,
        subtitle_en: form.subtitle_en || null,
        description: form.description || null,
        description_en: form.description_en || null,
        game_type: form.game_type,
        game_url: form.game_type === 'web' ? form.game_url.trim() : null,
        file_name: form.game_type === 'web' ? null : form.file_name,
        console_id: form.game_type === 'web' ? null : form.console_id,
        platform: form.platform,
        display_order: form.display_order,
        competition: form.competition,
        competition_link: form.competition_link || null,
        cover_url: coverUrl,
        max_players: form.max_players,
        youtube_video_id: form.youtube_video_id,
        youtube_start_sec: form.youtube_start_sec || 0,
        youtube_duration_sec: form.youtube_duration_sec,
        control_a: form.control_a.trim() || null,
        control_b: form.control_b.trim() || null,
        control_x: form.control_x.trim() || null,
        control_y: form.control_y.trim() || null,
        control_l: form.control_l.trim() || null,
        control_r: form.control_r.trim() || null,
        control_start: form.control_start.trim() || null,
        control_select: form.control_select.trim() || null,
        special_note: form.special_note.trim() || null,
        images,
        category_ids: categoryIds,
      };

      if (isEdit) {
        await api.put(`/api/games-v2/${id}`, payload);
        toast.success('Jeu mis à jour');
      } else {
        const { data } = await api.post('/api/games-v2', payload);
        toast.success('Jeu créé');
        navigate(`/contenus/jeux-v2/game/${data.game.id}`, { replace: true });
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
        onClick={() => navigate('/contenus/jeux-v2')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" /> Retour aux jeux v2
      </button>

      <h1 className="text-2xl font-bold mb-6">
        {isEdit ? 'Modifier le jeu' : 'Nouveau jeu'}
      </h1>

      <form onSubmit={handleSave} className="space-y-8">
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-lg font-semibold mb-2">Informations</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom (FR) *</label>
              <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom (EN)</label>
              <input type="text" value={form.name_en} onChange={(e) => set('name_en', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sous-titre (FR)</label>
              <input type="text" value={form.subtitle} onChange={(e) => set('subtitle', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sous-titre (EN)</label>
              <input type="text" value={form.subtitle_en} onChange={(e) => set('subtitle_en', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description (FR)</label>
              <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description (EN)</label>
              <textarea value={form.description_en} onChange={(e) => set('description_en', e.target.value)} rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type de jeu *</label>
            <select value={form.game_type} onChange={(e) => set('game_type', e.target.value as 'emulator' | 'web')}
              className="w-full md:w-1/2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent">
              <option value="emulator">Émulateur (ROM lancée sur la table)</option>
              <option value="web">Jeu web (joué dans l'app des tables)</option>
            </select>
            <p className="mt-1 text-xs text-gray-400">
              Un jeu web n'a ni ROM ni console : la table ouvre directement une page de l'app
              (ex. les échecs en réseau).
            </p>
          </div>

          {form.game_type === 'web' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL interne *</label>
              <input type="text" value={form.game_url} onChange={(e) => set('game_url', e.target.value)}
                placeholder="/table/games/chess"
                className="w-full md:w-1/2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm" />
              <p className="mt-1 text-xs text-gray-400">
                Doit commencer par <code>/table/</code> : la borne ne doit jamais sortir du kiosque.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom fichier *</label>
                <input type="text" value={form.file_name} onChange={(e) => set('file_name', e.target.value)}
                  placeholder="Ex : street_fighter_2"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm" />
                <p className="mt-1 text-xs text-gray-400">Nom du fichier ROM / dossier du jeu</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Console *</label>
                <select value={form.console_id} onChange={(e) => set('console_id', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                  <option value="">— Sélectionner —</option>
                  {allConsoles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.display_name && c.display_name !== c.name ? ` (${c.display_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ordre d'affichage</label>
              <input type="number" value={form.display_order} onChange={(e) => set('display_order', parseInt(e.target.value) || 100)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Joueurs max *</label>
              <select value={form.max_players} onChange={(e) => set('max_players', parseInt(e.target.value) as 1 | 2 | 3 | 4)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                <option value={1}>1 joueur</option>
                <option value={2}>2 joueurs</option>
                <option value={3}>3 joueurs</option>
                <option value={4}>4 joueurs</option>
              </select>
              <p className="mt-1 text-xs text-gray-400">Utilisé par le filtre joueurs sur les bornes.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Plateformes</label>
              <div className="flex gap-3 flex-wrap">
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
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <Youtube className="w-5 h-5 text-red-500" /> Vidéo YouTube (preview borne)
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL YouTube</label>
            <input
              type="text"
              value={form.youtube_url}
              onChange={(e) => onYoutubeUrlChange(e.target.value)}
              placeholder="https://youtu.be/dQw4w9WgXcQ ou https://www.youtube.com/watch?v=..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            {form.youtube_url && (
              form.youtube_video_id ? (
                <p className="mt-1 text-xs text-green-600">
                  Video ID détecté : <span className="font-mono">{form.youtube_video_id}</span>
                </p>
              ) : (
                <p className="mt-1 text-xs text-red-600">URL YouTube invalide</p>
              )
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Démarrer à (secondes)</label>
              <input
                type="number"
                min={0}
                value={form.youtube_start_sec}
                onChange={(e) => set('youtube_start_sec', Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Durée (secondes, optionnel)</label>
              <input
                type="number"
                min={1}
                value={form.youtube_duration_sec ?? ''}
                onChange={(e) => set('youtube_duration_sec', e.target.value ? Math.max(1, parseInt(e.target.value)) : null)}
                placeholder="vide = vidéo entière"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>

          <p className="text-xs text-gray-400">
            Le fade vers la jaquette s'active 0,5 s avant la fin de la durée configurée.
            Vidéo muette + sans contrôles côté borne.
          </p>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-3">
          <h2 className="text-lg font-semibold">Touches manette SNES</h2>
          <p className="text-xs text-gray-500">
            Décris l'action de chaque touche utilisée par le jeu. Les touches laissées vides ne seront pas affichées sur le schéma.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {CONTROL_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs font-mono font-semibold text-gray-700 mb-1">{label}</label>
                <input
                  type="text"
                  value={form[key] as string}
                  onChange={(e) => set(key, e.target.value as never)}
                  placeholder="Ex: Sauter"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500"
                />
              </div>
            ))}
          </div>

          <div className="pt-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Mention spéciale</label>
            <textarea
              value={form.special_note}
              onChange={(e) => set('special_note', e.target.value)}
              rows={2}
              placeholder="Ex: Astuce, règle maison, conseil de jeu… (affiché dans la modale de lancement)"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              La modale de rappel s'ouvre dès qu'il y a une mention OU au moins une touche configurée.
            </p>
          </div>
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
          <button type="button" onClick={() => navigate('/contenus/jeux-v2')}
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
