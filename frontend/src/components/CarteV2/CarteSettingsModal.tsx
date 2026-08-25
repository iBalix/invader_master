import { useCallback, useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';

export interface CarteSettings {
  id: string;
  happy_hour_start: string;
  happy_hour_end: string;
  happy_hour_days: string[];
  ordering_enabled: boolean;
  google_review_url: string | null;
  /** prompt de style commun a toutes les generations d'images produit */
  image_gen_prompt: string | null;
  /** produits dont l'image sert d'exemple a l'IA */
  image_gen_reference_product_ids: string[];
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

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CarteSettingsModal({ open, onClose }: Props) {
  const [settings, setSettings] = useState<CarteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [produitsAvecImage, setProduitsAvecImage] = useState<
    { id: string; name: string; image_url: string | null }[]
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/carte-settings');
      const s = data.data ?? data;
      setSettings({
        ...s,
        happy_hour_start: normalizeTime(s.happy_hour_start),
        happy_hour_end: normalizeTime(s.happy_hour_end),
        // la colonne n'existe pas tant que la migration 048 n'est pas passee :
        // on normalise pour que le formulaire fonctionne quand meme
        image_gen_prompt: s.image_gen_prompt ?? '',
        image_gen_reference_product_ids: s.image_gen_reference_product_ids ?? [],
      });
    } catch {
      toast.error('Erreur de chargement de la configuration');
    } finally {
      setLoading(false);
    }

    // liste des visuels selectionnables ; un echec ici ne doit pas empecher de
    // regler les horaires de happy hour
    try {
      const { data } = await api.get('/api/menu-products-v2');
      const items = (data?.items ?? []) as { id: string; name: string; image_url: string | null }[];
      setProduitsAvecImage(items.filter((p) => p.image_url));
    } catch {
      setProduitsAvecImage([]);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  if (!open) return null;

  const set = <K extends keyof CarteSettings>(key: K, val: CarteSettings[K]) => {
    setSettings((prev) => (prev ? { ...prev, [key]: val } : prev));
  };

  const basculerReference = (id: string) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const actuels = prev.image_gen_reference_product_ids ?? [];
      const suivants = actuels.includes(id)
        ? actuels.filter((x) => x !== id)
        : actuels.length >= 4
          ? actuels
          : [...actuels, id];
      return { ...prev, image_gen_reference_product_ids: suivants };
    });
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
        image_gen_prompt: settings.image_gen_prompt || null,
        image_gen_reference_product_ids: settings.image_gen_reference_product_ids ?? [],
      });
      toast.success('Configuration enregistrée');
      onClose();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Erreur lors de la sauvegarde';
      toast.error(message);
      console.error('[CarteSettingsModal] save error', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-bold">Paramètres de la carte</h2>
            <p className="text-xs text-gray-500">
              Happy Hour, module commande, Google Review.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading || !settings ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : (
          <form onSubmit={handleSave} className="p-5 space-y-6">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Happy Hour</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Heure de début</label>
                  <input
                    type="time"
                    value={settings.happy_hour_start}
                    onChange={(e) => set('happy_hour_start', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Heure de fin</label>
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
                <label className="block text-xs font-medium text-gray-600 mb-2">Jours actifs</label>
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

            <section className="space-y-3 border-t border-gray-200 pt-4">
              <h3 className="text-sm font-semibold text-gray-700">Module commande</h3>
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
                    Désactivé : bouton Commander masqué, panier inaccessible, commande refusée (403).
                  </p>
                </div>
              </label>
            </section>

            <section className="space-y-3 border-t border-gray-200 pt-4">
              <h3 className="text-sm font-semibold text-gray-700">Google Review</h3>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">URL Google Review</label>
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

            <section className="space-y-3 border-t border-gray-200 pt-4">
              <h3 className="text-sm font-semibold text-gray-700">Génération d'images par IA</h3>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Prompt de style
                </label>
                <textarea
                  value={settings.image_gen_prompt ?? ''}
                  onChange={(e) => set('image_gen_prompt', e.target.value)}
                  rows={4}
                  placeholder="Photographie de produit pour la carte d'un bar rétro gaming..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Ajouté à chaque génération, avant la description du produit. Décris ici le cadre
                  commun (cadrage, fond, lumière, ce qu'il ne faut pas voir), pas le produit.
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-medium text-gray-600">
                    Visuels donnés en exemple par défaut
                  </label>
                  <span className="text-xs text-gray-400 tabular-nums">
                    {(settings.image_gen_reference_product_ids ?? []).length}/4
                  </span>
                </div>
                <div className="grid grid-cols-6 gap-2 max-h-40 overflow-y-auto pr-1">
                  {produitsAvecImage.map((p) => {
                    const actif = (settings.image_gen_reference_product_ids ?? []).includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        title={p.name}
                        onClick={() => basculerReference(p.id)}
                        className={`relative aspect-video overflow-hidden rounded border-2 transition ${
                          actif ? 'border-primary-500' : 'border-transparent hover:border-gray-300'
                        }`}
                      >
                        <img src={p.image_url ?? ''} alt={p.name} className="w-full h-full object-cover" />
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Pré-cochés à chaque génération. Quatre au maximum : au-delà on paie des jetons
                  d'entrée sans gagner en cohérence de style.
                </p>
              </div>
            </section>

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Enregistrer
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
