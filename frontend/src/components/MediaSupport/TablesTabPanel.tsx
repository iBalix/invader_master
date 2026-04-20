/**
 * Onglet "Tables tactiles" de la page Config ecrans.
 *
 * Sous-onglets :
 *   - Mise en avant veille (table_screensaver_featured)
 *   - Mise en avant accueil (table_home_featured)
 *
 * Implementation reelle dans la todo "admin-config-ecrans-tab-tables".
 * Pour l'instant, structure visuelle + CRUD basique.
 */

import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import FileUpload from '../Quiz/FileUpload';

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
  active: boolean;
}

type SubTab = 'screensaver' | 'home';

const ENDPOINTS: Record<SubTab, string> = {
  screensaver: '/api/table-screensaver-featured',
  home: '/api/table-home-featured',
};

export default function TablesTabPanel() {
  const [subTab, setSubTab] = useState<SubTab>('screensaver');
  const [items, setItems] = useState<FeaturedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FeaturedItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(ENDPOINTS[subTab]);
      setItems(data.items ?? data ?? []);
    } catch {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [subTab]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleToggle(item: FeaturedItem) {
    try {
      await api.put(`${ENDPOINTS[subTab]}/${item.id}`, { active: !item.active });
      load();
    } catch {
      toast.error('Erreur lors du changement');
    }
  }

  async function handleDelete(item: FeaturedItem) {
    if (!confirm(`Supprimer "${item.title}" ?`)) return;
    try {
      await api.delete(`${ENDPOINTS[subTab]}/${item.id}`);
      toast.success('Supprime');
      load();
    } catch {
      toast.error('Erreur suppression');
    }
  }

  return (
    <div>
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setSubTab('screensaver')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition ${
            subTab === 'screensaver' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Mise en avant veille
        </button>
        <button
          onClick={() => setSubTab('home')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition ${
            subTab === 'home' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Mise en avant accueil
        </button>
      </div>

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
              active: true,
            })
          }
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition"
        >
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">Chargement...</p>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Aucun element</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Pos</th>
                <th className="px-4 py-3">Image</th>
                <th className="px-4 py-3">Titre</th>
                <th className="px-4 py-3">Sous-titre</th>
                {subTab === 'home' && <th className="px-4 py-3">CTA</th>}
                <th className="px-4 py-3 text-center">Actif</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items
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
                    <td className="px-4 py-3 font-medium">{it.title}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{it.subtitle || '—'}</td>
                    {subTab === 'home' && (
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {it.cta_label ? (
                          <>
                            <span className="font-medium">{it.cta_label}</span>
                            {it.cta_target && (
                              <span className="block text-xs text-gray-400">{it.cta_target}</span>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggle(it)}
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
          subTab={subTab}
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

function FeaturedEditModal({
  subTab,
  initial,
  onClose,
  onSaved,
}: {
  subTab: SubTab;
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
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        position: item.position,
        title: item.title.trim(),
        subtitle: item.subtitle?.trim() || null,
        image_url: item.image_url,
        active: item.active,
      };
      if (subTab === 'home') {
        payload.description = item.description?.trim() || null;
        payload.cta_label = item.cta_label?.trim() || null;
        payload.cta_target = item.cta_target?.trim() || null;
      }
      if (subTab === 'screensaver') {
        payload.lottie_url = item.lottie_url?.trim() || null;
      }
      if (item.id) {
        await api.put(`${ENDPOINTS[subTab]}/${item.id}`, payload);
      } else {
        await api.post(ENDPOINTS[subTab], payload);
      }
      toast.success('Enregistre');
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
      <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">
            {item.id ? 'Modifier' : 'Ajouter'} - {subTab === 'screensaver' ? 'Veille' : 'Accueil'}
          </h2>
        </div>
        <div className="space-y-4 p-6">
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

          {subTab === 'screensaver' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL Lottie (optionnel)</label>
              <input
                type="text"
                value={item.lottie_url ?? ''}
                onChange={(e) => set('lottie_url', e.target.value)}
                placeholder="https://lottie.host/..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 font-mono text-xs"
              />
            </div>
          )}

          {subTab === 'home' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={item.description ?? ''}
                  onChange={(e) => set('description', e.target.value)}
                  rows={4}
                  placeholder="Texte affiche dans la modale de detail (si la card n'a pas de CTA)."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 resize-y"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Affichee cote table tactile dans une modale au clic sur la card,
                  uniquement quand aucun CTA n'est defini.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Label CTA</label>
                <input
                  type="text"
                  value={item.cta_label ?? ''}
                  onChange={(e) => set('cta_label', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cible CTA (path/URL)</label>
                <input
                  type="text"
                  value={item.cta_target ?? ''}
                  onChange={(e) => set('cta_target', e.target.value)}
                  placeholder="/table/menu"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 font-mono text-xs"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Si rempli, la card devient un lien et la description ne s'affiche pas.
                </p>
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t px-6 py-4">
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
