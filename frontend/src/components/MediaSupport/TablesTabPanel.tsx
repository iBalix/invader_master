/**
 * Onglet "Tables tactiles" de la page Config ecrans.
 *
 * Sous-onglets :
 *   - General : reglages globaux (duree avant veille, delai mises en avant)
 *   - Mises en avant : table unique `table_featured` (accueil et/ou veille)
 *   - Design : configs design (image fond + couleurs boutons + planification)
 */

import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Loader2, Home, Moon } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import FileUpload from '../Quiz/FileUpload';
import DesignManager from './DesignManager';

interface FeaturedItem {
  id: string;
  position: number;
  title: string;
  subtitle: string | null;
  description?: string | null;
  image_url: string | null;
  lottie_url?: string | null;
  cta_label?: string | null;
  cta_target?: string | null;
  show_on_home: boolean;
  show_on_screensaver: boolean;
  active: boolean;
}

interface TablesSettings {
  id: string;
  screensaver_timeout_ms: number;
  home_featured_interval_ms: number;
  home_button_preview_interval_ms: number;
  menu_button_image_url: string | null;
  games_button_image_url: string | null;
  menu_button_color: string;
  games_button_color: string;
}

type SubTab = 'general' | 'featured' | 'design';

const SUBTABS: { key: SubTab; label: string }[] = [
  { key: 'general', label: 'Général' },
  { key: 'featured', label: 'Mises en avant' },
  { key: 'design', label: 'Design' },
];

export default function TablesTabPanel() {
  const [subTab, setSubTab] = useState<SubTab>('general');

  return (
    <div>
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {SUBTABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setSubTab(tb.key)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${
              subTab === tb.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {subTab === 'general' ? <GeneralSettings /> : subTab === 'featured' ? <FeaturedManager /> : <DesignManager />}
    </div>
  );
}

// ============================================================
// Onglet Général — réglages globaux
// ============================================================
function GeneralSettings() {
  const [settings, setSettings] = useState<TablesSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/tables-settings');
      setSettings(data.data ?? data);
    } catch {
      toast.error('Erreur de chargement des réglages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function set<K extends keyof TablesSettings>(k: K, v: TablesSettings[K]) {
    setSettings((s) => (s ? { ...s, [k]: v } : s));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      await api.put('/api/tables-settings', {
        screensaver_timeout_ms: settings.screensaver_timeout_ms,
        home_featured_interval_ms: settings.home_featured_interval_ms,
      });
      toast.success('Réglages enregistrés');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  const timeoutSec = Math.round(settings.screensaver_timeout_ms / 1000);
  const featuredIntervalSec = Math.round((settings.home_featured_interval_ms ?? 30000) / 1000);

  return (
    <form onSubmit={save} className="max-w-2xl space-y-6">
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">Écran de veille</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Durée avant bascule sur la veille (secondes)
          </label>
          <input
            type="number"
            min={10}
            value={timeoutSec}
            onChange={(e) => set('screensaver_timeout_ms', Math.max(10, parseInt(e.target.value) || 90) * 1000)}
            className="w-40 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-gray-400">
            Sans action sur la borne pendant ce délai, l'écran de veille s'affiche. Minimum 10 s.
          </p>
        </div>
      </section>

      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">Accueil — mises en avant</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Délai entre apparitions des mises en avant (secondes)
          </label>
          <input
            type="number"
            min={5}
            value={featuredIntervalSec}
            onChange={(e) => set('home_featured_interval_ms', Math.max(5, parseInt(e.target.value) || 30) * 1000)}
            className="w-40 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-gray-400">
            Le bandeau affiche le prochain évènement en permanence ; toutes les X secondes, une mise en avant apparaît brièvement puis l'évènement reprend sa place. Minimum 5 s.
          </p>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition disabled:opacity-50"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Enregistrer
        </button>
      </div>
    </form>
  );
}

// ============================================================
// Onglet Mises en avant — table unique avec emplacements
// ============================================================
function FeaturedManager() {
  const [items, setItems] = useState<FeaturedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FeaturedItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/table-featured');
      setItems(data.items ?? []);
    } catch {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleToggle(item: FeaturedItem, field: 'active' | 'show_on_home' | 'show_on_screensaver') {
    try {
      await api.put(`/api/table-featured/${item.id}`, { [field]: !item[field] });
      load();
    } catch {
      toast.error('Erreur lors du changement');
    }
  }

  async function handleDelete(item: FeaturedItem) {
    if (!confirm(`Supprimer "${item.title}" ?`)) return;
    try {
      await api.delete(`/api/table-featured/${item.id}`);
      toast.success('Supprimé');
      load();
    } catch {
      toast.error('Erreur suppression');
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          onClick={() =>
            setEditing({
              id: '',
              position: items.length,
              title: '',
              subtitle: '',
              description: '',
              image_url: '',
              cta_label: '',
              cta_target: '',
              lottie_url: '',
              show_on_home: true,
              show_on_screensaver: false,
              active: true,
            })
          }
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition"
        >
          <Plus className="w-4 h-4" /> Ajouter une mise en avant
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">Chargement...</p>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Aucune mise en avant</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Pos</th>
                <th className="px-4 py-3">Image</th>
                <th className="px-4 py-3">Titre</th>
                <th className="px-4 py-3 text-center">Accueil</th>
                <th className="px-4 py-3 text-center">Veille</th>
                <th className="px-4 py-3 text-center">Actif</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[...items]
                .sort((a, b) => a.position - b.position)
                .map((it) => (
                  <tr key={it.id} className={`hover:bg-gray-50 ${!it.active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 text-sm text-gray-500">{it.position}</td>
                    <td className="px-4 py-3">
                      {it.image_url ? (
                        <img src={it.image_url} alt="" className="h-10 w-16 object-cover rounded" />
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{it.title}</div>
                      {it.subtitle && <div className="text-xs text-gray-400">{it.subtitle}</div>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <PlacementToggle
                        on={it.show_on_home}
                        icon={Home}
                        onClick={() => handleToggle(it, 'show_on_home')}
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <PlacementToggle
                        on={it.show_on_screensaver}
                        icon={Moon}
                        onClick={() => handleToggle(it, 'show_on_screensaver')}
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggle(it, 'active')}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                          it.active ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                            it.active ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setEditing(it)} className="p-1.5 text-gray-400 hover:text-primary-500" title="Modifier">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(it)} className="p-1.5 text-gray-400 hover:text-red-500" title="Supprimer">
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

      {editing && (
        <FeaturedEditModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function PlacementToggle({
  on,
  icon: Icon,
  onClick,
}: {
  on: boolean;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
        on
          ? 'border-primary-500 bg-primary-50 text-primary-600'
          : 'border-gray-200 bg-gray-50 text-gray-300 hover:text-gray-400'
      }`}
      title={on ? 'Affiché' : 'Masqué'}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

function FeaturedEditModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: FeaturedItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [item, setItem] = useState<FeaturedItem>(initial);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof FeaturedItem>(k: K, v: FeaturedItem[K]) {
    setItem((s) => ({ ...s, [k]: v }));
  }

  async function save() {
    if (!item.title?.trim()) {
      toast.error('Le titre est obligatoire');
      return;
    }
    if (!item.image_url) {
      toast.error("L'image est obligatoire");
      return;
    }
    if (!item.show_on_home && !item.show_on_screensaver) {
      toast.error('Choisis au moins un emplacement (accueil ou veille)');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        position: item.position,
        title: item.title.trim(),
        subtitle: item.subtitle?.trim() || null,
        description: item.description?.trim() || null,
        image_url: item.image_url,
        cta_label: item.cta_label?.trim() || null,
        cta_target: item.cta_target?.trim() || null,
        lottie_url: item.lottie_url?.trim() || null,
        show_on_home: item.show_on_home,
        show_on_screensaver: item.show_on_screensaver,
        active: item.active,
      };
      if (item.id) {
        await api.put(`/api/table-featured/${item.id}`, payload);
      } else {
        await api.post('/api/table-featured', payload);
      }
      toast.success('Enregistré');
      onSaved();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err as Error)?.message ??
        "Erreur d'enregistrement";
      toast.error(msg);
      console.error('[TablesTabPanel] save error:', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl">
        <div className="border-b px-6 py-4 sticky top-0 bg-white">
          <h2 className="text-lg font-semibold">
            {item.id ? 'Modifier la mise en avant' : 'Nouvelle mise en avant'}
          </h2>
        </div>
        <div className="space-y-4 p-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Emplacements *</label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.show_on_home}
                  onChange={(e) => set('show_on_home', e.target.checked)}
                />
                <Home className="w-4 h-4 text-gray-500" />
                <span className="text-sm">Accueil</span>
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.show_on_screensaver}
                  onChange={(e) => set('show_on_screensaver', e.target.checked)}
                />
                <Moon className="w-4 h-4 text-gray-500" />
                <span className="text-sm">Écran de veille</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Position</label>
              <input
                type="number"
                value={item.position}
                onChange={(e) => set('position', Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.active}
                  onChange={(e) => set('active', e.target.checked)}
                />
                <span className="text-sm">Actif</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label>
            <input
              type="text"
              value={item.title}
              onChange={(e) => set('title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sous-titre</label>
            <input
              type="text"
              value={item.subtitle ?? ''}
              onChange={(e) => set('subtitle', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <FileUpload
            label="Image *"
            accept="image/*"
            value={item.image_url}
            onChange={(v) => set('image_url', v)}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={item.description ?? ''}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
              placeholder="Texte affiché dans la modale de détail (accueil, si pas de CTA)."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 resize-y"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Label CTA (accueil)</label>
              <input
                type="text"
                value={item.cta_label ?? ''}
                onChange={(e) => set('cta_label', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cible CTA</label>
              <input
                type="text"
                value={item.cta_target ?? ''}
                onChange={(e) => set('cta_target', e.target.value)}
                placeholder="/table/menu"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 font-mono text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL Lottie (veille, optionnel)</label>
            <input
              type="text"
              value={item.lottie_url ?? ''}
              onChange={(e) => set('lottie_url', e.target.value)}
              placeholder="https://lottie.host/..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 font-mono text-xs"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-6 py-4 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-900">
            Annuler
          </button>
          <button
            onClick={save}
            disabled={saving || !item.title?.trim() || !item.image_url}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
