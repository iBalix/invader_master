import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

interface CarteSettings {
  id: string;
  happy_hour_start: string;
  happy_hour_end: string;
  happy_hour_days: string[];
  ordering_enabled: boolean;
  google_review_url: string | null;
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

function normalizeTime(value: string): string {
  if (!value) return value;
  return value.length === 8 ? value.slice(0, 5) : value;
}

export default function CarteSettingsPage() {
  const [settings, setSettings] = useState<CarteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/api/carte-settings');
      const s = data.data ?? data;
      setSettings({
        ...s,
        happy_hour_start: normalizeTime(s.happy_hour_start),
        happy_hour_end: normalizeTime(s.happy_hour_end),
      });
    } catch {
      toast.error('Erreur de chargement de la configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = <K extends keyof CarteSettings>(key: K, val: CarteSettings[K]) => {
    setSettings((prev) => (prev ? { ...prev, [key]: val } : prev));
  };

  const toggleDay = (day: string) => {
    if (!settings) return;
    const has = settings.happy_hour_days.includes(day);
    const next = has
      ? settings.happy_hour_days.filter((d) => d !== day)
      : [...settings.happy_hour_days, day];
    set('happy_hour_days', next);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    if (settings.happy_hour_end <= settings.happy_hour_start) {
      toast.error('L\'heure de fin doit être après l\'heure de début');
      return;
    }
    if (
      settings.google_review_url &&
      !/^https:\/\//.test(settings.google_review_url)
    ) {
      toast.error('L\'URL Google doit commencer par https://');
      return;
    }

    setSaving(true);
    try {
      await api.put('/api/carte-settings', {
        happy_hour_start: settings.happy_hour_start,
        happy_hour_end: settings.happy_hour_end,
        happy_hour_days: settings.happy_hour_days,
        ordering_enabled: settings.ordering_enabled,
        google_review_url: settings.google_review_url || null,
      });
      toast.success('Configuration enregistrée');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Erreur lors de la sauvegarde';
      toast.error(message);
      console.error('[CarteSettings] save error', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Paramètres de la Carte</h1>
      <p className="text-sm text-gray-500 mb-6">
        Configuration globale lue par les tables tactiles (Happy Hour, module commande, Google Review).
      </p>

      <form onSubmit={handleSave} className="space-y-6">
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-lg font-semibold">Happy Hour</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Heure de début</label>
              <input
                type="time"
                value={settings.happy_hour_start}
                onChange={(e) => set('happy_hour_start', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Heure de fin</label>
              <input
                type="time"
                value={settings.happy_hour_end}
                onChange={(e) => set('happy_hour_end', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Jours actifs</label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => {
                const active = settings.happy_hour_days.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition ${
                      active
                        ? 'bg-primary-500 text-white border-primary-500'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-lg font-semibold">Module commande</h2>

          <label className="flex items-center gap-3 cursor-pointer">
            <button
              type="button"
              onClick={() => set('ordering_enabled', !settings.ordering_enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                settings.ordering_enabled ? 'bg-primary-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                  settings.ordering_enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <div>
              <p className="text-sm font-medium text-gray-700">
                {settings.ordering_enabled ? 'Activé' : 'Désactivé'}
              </p>
              <p className="text-xs text-gray-500">
                Si désactivé : bouton Commander masqué, panier inaccessible, commande POST refusée (403).
              </p>
            </div>
          </label>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-lg font-semibold">Google Review</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL Google Review</label>
            <input
              type="url"
              value={settings.google_review_url ?? ''}
              onChange={(e) => set('google_review_url', e.target.value)}
              placeholder="https://g.page/r/..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-400">
              Affiché en bas de la carte sur les tables tactiles lorsque le module commande est désactivé.
            </p>
          </div>
        </section>

        <div className="flex justify-end gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition disabled:opacity-50"
          >
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </div>
  );
}
