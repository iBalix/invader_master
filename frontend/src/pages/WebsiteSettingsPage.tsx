import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

interface WebsiteSettings {
  id: string;
  top_banner_monday: string | null;
  top_banner_tuesday: string | null;
  top_banner_wednesday: string | null;
  top_banner_thursday: string | null;
  top_banner_friday: string | null;
  top_banner_saturday: string | null;
  top_banner_sunday: string | null;
  top_banner_override: string | null;
}

const DAY_FIELDS: { key: keyof WebsiteSettings; label: string }[] = [
  { key: 'top_banner_monday', label: 'Lundi' },
  { key: 'top_banner_tuesday', label: 'Mardi' },
  { key: 'top_banner_wednesday', label: 'Mercredi' },
  { key: 'top_banner_thursday', label: 'Jeudi' },
  { key: 'top_banner_friday', label: 'Vendredi' },
  { key: 'top_banner_saturday', label: 'Samedi' },
  { key: 'top_banner_sunday', label: 'Dimanche' },
];

export default function WebsiteSettingsPage() {
  const [settings, setSettings] = useState<WebsiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/api/website-settings');
      setSettings(data.data ?? data);
    } catch {
      toast.error('Erreur de chargement de la configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = <K extends keyof WebsiteSettings>(key: K, val: WebsiteSettings[K]) => {
    setSettings((prev) => (prev ? { ...prev, [key]: val } : prev));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    setSaving(true);
    try {
      await api.put('/api/website-settings', {
        top_banner_monday: settings.top_banner_monday || null,
        top_banner_tuesday: settings.top_banner_tuesday || null,
        top_banner_wednesday: settings.top_banner_wednesday || null,
        top_banner_thursday: settings.top_banner_thursday || null,
        top_banner_friday: settings.top_banner_friday || null,
        top_banner_saturday: settings.top_banner_saturday || null,
        top_banner_sunday: settings.top_banner_sunday || null,
        top_banner_override: settings.top_banner_override || null,
      });
      toast.success('Configuration enregistrée');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Erreur lors de la sauvegarde';
      toast.error(message);
      console.error('[WebsiteSettings] save error', err);
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
      <h1 className="text-2xl font-bold mb-2">Paramètres du site web</h1>
      <p className="text-sm text-gray-500 mb-6">
        Messages du bandeau de haut de page du site vitrine (invader.bar). Un message par
        jour de la semaine, affiché selon le jour courant. Laissez un champ vide pour ne
        rien afficher ce jour-là.
      </p>

      <form onSubmit={handleSave} className="space-y-6">
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-lg font-semibold">Message prioritaire (override)</h2>
          <p className="text-xs text-gray-500">
            Si rempli, ce message s'affiche tous les jours et remplace les messages
            quotidiens ci-dessous. Pratique pour une annonce ponctuelle (fermeture
            exceptionnelle, événement…). Laissez vide pour revenir au mode normal.
          </p>
          <textarea
            value={settings.top_banner_override ?? ''}
            onChange={(e) => set('top_banner_override', e.target.value)}
            rows={2}
            placeholder="Ex : 🎉 Soirée spéciale ce vendredi !"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-lg font-semibold">Messages par jour</h2>
          {DAY_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input
                type="text"
                value={(settings[key] as string | null) ?? ''}
                onChange={(e) => set(key, e.target.value)}
                placeholder="Ex : 🟢 Ouvert ce soir de 18h à 23h30"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          ))}
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
