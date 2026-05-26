/**
 * Onglet "Design" de la config tables tactiles : CRUD des configs design
 * (presets activables / planifies). Une config = image de fond + couleurs
 * boutons + planification (toujours / plage de dates / recurrente).
 */

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import FileUpload from '../Quiz/FileUpload';

interface DesignConfig {
  id: string;
  name: string;
  background_image_url: string | null;
  menu_button_color: string;
  games_button_color: string;
  active: boolean;
  schedule_type: 'always' | 'date_range' | 'recurring';
  starts_at: string | null;
  ends_at: string | null;
  recurring_days: string[];
  start_time: string | null;
  end_time: string | null;
}

const DAYS: { value: string; label: string }[] = [
  { value: 'mon', label: 'Lun' },
  { value: 'tue', label: 'Mar' },
  { value: 'wed', label: 'Mer' },
  { value: 'thu', label: 'Jeu' },
  { value: 'fri', label: 'Ven' },
  { value: 'sat', label: 'Sam' },
  { value: 'sun', label: 'Dim' },
];

const ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function scheduleLabel(c: DesignConfig): string {
  if (c.schedule_type === 'date_range') {
    const f = (s: string | null) =>
      s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
    return `${f(c.starts_at)} → ${f(c.ends_at)}`;
  }
  if (c.schedule_type === 'recurring') {
    const days = [...(c.recurring_days ?? [])]
      .sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
      .map((d) => DAYS.find((x) => x.value === d)?.label ?? d)
      .join(' ');
    const t = (s: string | null) => (s ? s.slice(0, 5) : '—');
    return `${days || '—'} · ${t(c.start_time)}-${t(c.end_time)}`;
  }
  return 'Toujours';
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-12 h-10 border border-gray-300 rounded cursor-pointer" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#RRGGBB"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>
    </div>
  );
}

export default function DesignManager() {
  const [items, setItems] = useState<DesignConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DesignConfig | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/design-configs');
      setItems(data.items ?? []);
    } catch {
      toast.error('Erreur de chargement des configs design');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(c: DesignConfig) {
    try {
      await api.put(`/api/design-configs/${c.id}`, { active: !c.active });
      load();
    } catch {
      toast.error('Erreur lors du changement');
    }
  }

  async function handleDelete(c: DesignConfig) {
    if (!confirm(`Supprimer la config "${c.name}" ?`)) return;
    try {
      await api.delete(`/api/design-configs/${c.id}`);
      toast.success('Supprimée');
      load();
    } catch {
      toast.error('Erreur suppression');
    }
  }

  const emptyConfig: DesignConfig = {
    id: '',
    name: '',
    background_image_url: null,
    menu_button_color: '#7b2bff',
    games_button_color: '#ff2bd6',
    active: true,
    schedule_type: 'always',
    starts_at: null,
    ends_at: null,
    recurring_days: [],
    start_time: null,
    end_time: null,
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-3">
        <p className="text-xs text-gray-500 max-w-2xl">
          Une config design regroupe l'image de fond (accueil + veille) et les couleurs des boutons.
          Si plusieurs configs sont actives, celle dont la planification (plage de dates ou récurrente)
          correspond au moment présent est prioritaire ; sinon on retombe sur une config « Toujours ».
        </p>
        <button
          onClick={() => setEditing(emptyConfig)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition shrink-0"
        >
          <Plus className="w-4 h-4" /> Ajouter une config
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">Chargement...</p>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Aucune config design</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Fond</th>
                <th className="px-4 py-3">Couleurs</th>
                <th className="px-4 py-3">Planification</th>
                <th className="px-4 py-3 text-center">Active</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((c) => (
                <tr key={c.id} className={`hover:bg-gray-50 ${!c.active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3">
                    {c.background_image_url ? (
                      <img src={c.background_image_url} alt="" className="h-10 w-16 object-cover rounded" />
                    ) : (
                      <span className="text-xs text-gray-400">défaut</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-5 h-5 rounded-full border border-gray-200" style={{ backgroundColor: c.menu_button_color }} title={`Carte ${c.menu_button_color}`} />
                      <span className="inline-block w-5 h-5 rounded-full border border-gray-200" style={{ backgroundColor: c.games_button_color }} title={`Jeux ${c.games_button_color}`} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{scheduleLabel(c)}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => toggleActive(c)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${c.active ? 'bg-green-500' : 'bg-gray-300'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${c.active ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditing(c)} className="p-1.5 text-gray-400 hover:text-primary-500" title="Modifier">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(c)} className="p-1.5 text-gray-400 hover:text-red-500" title="Supprimer">
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
        <DesignEditModal
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

function DesignEditModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: DesignConfig;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [item, setItem] = useState<DesignConfig>(initial);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof DesignConfig>(k: K, v: DesignConfig[K]) {
    setItem((s) => ({ ...s, [k]: v }));
  }

  function toggleDay(d: string) {
    const has = item.recurring_days.includes(d);
    set('recurring_days', has ? item.recurring_days.filter((x) => x !== d) : [...item.recurring_days, d]);
  }

  async function save() {
    if (!item.name.trim()) {
      toast.error('Le nom est obligatoire');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: item.name.trim(),
        background_image_url: item.background_image_url || null,
        menu_button_color: item.menu_button_color,
        games_button_color: item.games_button_color,
        active: item.active,
        schedule_type: item.schedule_type,
        starts_at: item.schedule_type === 'date_range' ? item.starts_at : null,
        ends_at: item.schedule_type === 'date_range' ? item.ends_at : null,
        recurring_days: item.schedule_type === 'recurring' ? item.recurring_days : [],
        start_time: item.schedule_type === 'recurring' ? item.start_time : null,
        end_time: item.schedule_type === 'recurring' ? item.end_time : null,
      };
      if (item.id) {
        await api.put(`/api/design-configs/${item.id}`, payload);
      } else {
        await api.post('/api/design-configs', payload);
      }
      toast.success('Enregistré');
      onSaved();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Erreur d'enregistrement";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl">
        <div className="border-b px-6 py-4 sticky top-0 bg-white">
          <h2 className="text-lg font-semibold">{item.id ? 'Modifier la config design' : 'Nouvelle config design'}</h2>
        </div>
        <div className="space-y-4 p-6">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
              <input
                type="text"
                value={item.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Ex : Standard, Noël…"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={item.active} onChange={(e) => set('active', e.target.checked)} />
                <span className="text-sm">Active</span>
              </label>
            </div>
          </div>

          <FileUpload
            label="Image de fond (accueil + veille)"
            accept="image/*"
            value={item.background_image_url}
            onChange={(v) => set('background_image_url', v)}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ColorField label="Couleur bouton Carte" value={item.menu_button_color} onChange={(v) => set('menu_button_color', v)} />
            <ColorField label="Couleur bouton Jeux" value={item.games_button_color} onChange={(v) => set('games_button_color', v)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Planification</label>
            <select
              value={item.schedule_type}
              onChange={(e) => set('schedule_type', e.target.value as DesignConfig['schedule_type'])}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            >
              <option value="always">Toujours (config par défaut)</option>
              <option value="date_range">Plage de dates</option>
              <option value="recurring">Récurrente (jours + horaire)</option>
            </select>
            <p className="mt-1 text-xs text-gray-400">
              Une config planifiée est prioritaire sur une config « Toujours » lorsqu'elle correspond au moment présent.
            </p>
          </div>

          {item.schedule_type === 'date_range' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Début</label>
                <input
                  type="datetime-local"
                  value={toLocalInput(item.starts_at)}
                  onChange={(e) => set('starts_at', fromLocalInput(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fin</label>
                <input
                  type="datetime-local"
                  value={toLocalInput(item.ends_at)}
                  onChange={(e) => set('ends_at', fromLocalInput(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
          )}

          {item.schedule_type === 'recurring' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Jours</label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((d) => {
                    const on = item.recurring_days.includes(d.value);
                    return (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => toggleDay(d.value)}
                        className={`px-3 py-1.5 text-sm rounded-lg border transition ${on ? 'bg-primary-500 text-white border-primary-500' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Heure début</label>
                  <input
                    type="time"
                    value={item.start_time ? item.start_time.slice(0, 5) : ''}
                    onChange={(e) => set('start_time', e.target.value || null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Heure fin</label>
                  <input
                    type="time"
                    value={item.end_time ? item.end_time.slice(0, 5) : ''}
                    onChange={(e) => set('end_time', e.target.value || null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t px-6 py-4 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-900">Annuler</button>
          <button
            onClick={save}
            disabled={saving || !item.name.trim()}
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
