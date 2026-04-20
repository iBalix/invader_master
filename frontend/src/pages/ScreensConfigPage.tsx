/**
 * Page "Config ecrans" (anciennement "Support medias").
 *
 * 3 onglets :
 *   - Projecteur : config singleton (ex: video de fond, prochain event)
 *                  Les events sont desormais geres dans /contenus/evenements (page dediee).
 *   - TV         : configurations diffusees sur les ecrans TV du bar
 *   - Tables     : sera ajoute dans la todo "admin-config-ecrans-tab-tables"
 *                  (mise en avant veille + accueil des tables tactiles)
 */

import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import FileUpload from '../components/Quiz/FileUpload';
import TvConfigModal, { type TvConfigData } from '../components/MediaSupport/TvConfigModal';
import TablesTabPanel from '../components/MediaSupport/TablesTabPanel';

interface ProjectorConfig {
  id?: string;
  name: string;
  next_event_title: string;
  next_event_subtitle: string;
  next_event_description: string;
  next_event_image_url: string | null;
  background_video_youtube: string;
}

interface TvConfigRow {
  id: string;
  name: string;
  active: boolean;
  youtube_videos: string[];
  media_video_urls: string[];
  media_image_urls: string[];
  target: string[];
}

type Tab = 'projector' | 'tv' | 'tables';

const EMPTY_CONFIG: ProjectorConfig = {
  name: 'Config Projo',
  next_event_title: '',
  next_event_subtitle: '',
  next_event_description: '',
  next_event_image_url: null,
  background_video_youtube: '',
};

export default function ScreensConfigPage() {
  const [tab, setTab] = useState<Tab>('projector');
  const [config, setConfig] = useState<ProjectorConfig>({ ...EMPTY_CONFIG });
  const [tvConfigs, setTvConfigs] = useState<TvConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [tvModal, setTvModal] = useState<{ open: boolean; editing: TvConfigData | null }>({ open: false, editing: null });

  const loadProjector = useCallback(async () => {
    try {
      const configRes = await api.get('/api/projector-config');
      if (configRes.data.config) {
        const c = configRes.data.config;
        setConfig({
          id: c.id,
          name: c.name ?? 'Config Projo',
          next_event_title: c.next_event_title ?? '',
          next_event_subtitle: c.next_event_subtitle ?? '',
          next_event_description: c.next_event_description ?? '',
          next_event_image_url: c.next_event_image_url ?? null,
          background_video_youtube: c.background_video_youtube ?? '',
        });
      }
    } catch {
      toast.error('Erreur de chargement projecteur');
    }
  }, []);

  const loadTvConfigs = useCallback(async () => {
    try {
      const { data } = await api.get('/api/tv-configs');
      setTvConfigs(data.items ?? []);
    } catch {
      toast.error('Erreur de chargement configs TV');
    }
  }, []);

  useEffect(() => {
    Promise.all([loadProjector(), loadTvConfigs()]).finally(() => setLoading(false));
  }, [loadProjector, loadTvConfigs]);

  const setConfigField = <K extends keyof ProjectorConfig>(key: K, val: ProjectorConfig[K]) =>
    setConfig((prev) => ({ ...prev, [key]: val }));

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      await api.put('/api/projector-config', {
        ...config,
        next_event_title: config.next_event_title || null,
        next_event_subtitle: config.next_event_subtitle || null,
        next_event_description: config.next_event_description || null,
        background_video_youtube: config.background_video_youtube || null,
      });
      toast.success('Configuration sauvegardée');
      loadProjector();
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTvSave = async (data: TvConfigData) => {
    try {
      if (data.id) {
        await api.put(`/api/tv-configs/${data.id}`, data);
        toast.success('Config TV mise à jour');
      } else {
        await api.post('/api/tv-configs', data);
        toast.success('Config TV créée');
      }
      setTvModal({ open: false, editing: null });
      loadTvConfigs();
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const handleToggleTvActive = async (id: string, active: boolean) => {
    try {
      await api.put(`/api/tv-configs/${id}`, { active: !active });
      toast.success(!active ? 'Config activée' : 'Config désactivée');
      loadTvConfigs();
    } catch {
      toast.error('Erreur lors du changement de statut');
    }
  };

  const handleDeleteTv = async (id: string, name: string) => {
    if (!confirm(`Supprimer la config "${name}" ?`)) return;
    try {
      await api.delete(`/api/tv-configs/${id}`);
      toast.success('Config TV supprimée');
      loadTvConfigs();
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  if (loading) return <p className="text-gray-500">Chargement...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Config écrans</h1>
        <div className="flex items-center gap-2">
          {tab === 'tv' && (
            <button onClick={() => setTvModal({ open: true, editing: null })} className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition">
              <Plus className="w-4 h-4" />Créer une config TV
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <button onClick={() => setTab('projector')} className={`px-4 py-2 text-sm font-medium rounded-md transition ${tab === 'projector' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          Projecteur
        </button>
        <button onClick={() => setTab('tv')} className={`px-4 py-2 text-sm font-medium rounded-md transition ${tab === 'tv' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          TV ({tvConfigs.length})
        </button>
        <button onClick={() => setTab('tables')} className={`px-4 py-2 text-sm font-medium rounded-md transition ${tab === 'tables' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          Tables tactiles
        </button>
      </div>

      {tab === 'projector' && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-lg font-semibold">Configuration projecteur</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
            <input type="text" value={config.name} onChange={(e) => setConfigField('name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vidéo de fond (ID YouTube)</label>
            <input type="text" value={config.background_video_youtube} onChange={(e) => setConfigField('background_video_youtube', e.target.value)}
              placeholder="Ex: dQw4w9WgXcQ"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm" />
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-3">Prochain événement (mis en avant projecteur)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Titre</label>
                <input type="text" value={config.next_event_title} onChange={(e) => setConfigField('next_event_title', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sous-titre</label>
                <input type="text" value={config.next_event_subtitle} onChange={(e) => setConfigField('next_event_subtitle', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input type="text" value={config.next_event_description} onChange={(e) => setConfigField('next_event_description', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            </div>
            <div className="mt-4">
              <FileUpload label="Image événement" accept="image/*" value={config.next_event_image_url} onChange={(v) => setConfigField('next_event_image_url', v)} />
            </div>
          </div>

          <p className="text-sm text-gray-500 italic border-l-4 border-blue-200 pl-3">
            Les événements (quiz, soirées thématiques, etc.) sont désormais gérés depuis{' '}
            <a href="/contenus/evenements" className="text-primary-500 underline">Contenus &rsaquo; Événements</a>.
          </p>

          <div className="flex justify-end pt-2">
            <button onClick={handleSaveConfig} disabled={savingConfig}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition disabled:opacity-50">
              {savingConfig && <Loader2 className="w-4 h-4 animate-spin" />}
              Sauvegarder
            </button>
          </div>
        </section>
      )}

      {tab === 'tv' && (
        tvConfigs.length === 0 ? (
          <div className="text-center py-12 text-gray-400"><p className="text-lg">Aucune configuration TV</p></div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-3">Nom</th>
                  <th className="px-6 py-3 text-center">Actif</th>
                  <th className="px-6 py-3">Cible(s)</th>
                  <th className="px-6 py-3 text-center">YouTube</th>
                  <th className="px-6 py-3 text-center">Vidéos</th>
                  <th className="px-6 py-3 text-center">Images</th>
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tvConfigs.map((c) => (
                  <tr key={c.id} className={`hover:bg-gray-50 transition ${!c.active ? 'opacity-50' : ''}`}>
                    <td className="px-6 py-4 font-medium">{c.name}</td>
                    <td className="px-6 py-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleTvActive(c.id, c.active)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${c.active ? 'bg-green-500' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${c.active ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {c.target.length > 0
                          ? c.target.map((t, i) => <span key={i} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{t}</span>)
                          : <span className="text-xs text-gray-400">—</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">{c.youtube_videos.length}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">{c.media_video_urls.length}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">{c.media_image_urls.length}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setTvModal({ open: true, editing: c })} className="p-1.5 text-gray-400 hover:text-primary-500 transition" title="Modifier">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteTv(c.id, c.name)} className="p-1.5 text-gray-400 hover:text-red-500 transition" title="Supprimer">
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

      {tab === 'tables' && (
        <TablesTabPanel />
      )}

      {tvModal.open && <TvConfigModal initial={tvModal.editing} onSave={handleTvSave} onClose={() => setTvModal({ open: false, editing: null })} />}
    </div>
  );
}
