/**
 * Modal de creation/edition d'un evenement.
 *
 * Champs :
 *   - name (requis)
 *   - description
 *   - date (datetime-local, requis)
 *   - icon (Promo / Jeu / Cocktail / autre)
 *   - active
 *   - cta_redirect_url : URL vers laquelle rediriger si l'utilisateur clique
 *     sur le CTA "Rejoindre" depuis une table tactile (ex: http://localhost/quizz.php).
 *     Quand vide, pas de CTA redirect (event juste informatif).
 */

import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';

export interface EventData {
  id?: string;
  name: string;
  description: string;
  date: string;
  icon: string | null;
  active: boolean;
  cta_redirect_url: string | null;
}

interface Props {
  initial: EventData | null;
  onSave: (data: EventData) => Promise<void>;
  onClose: () => void;
}

const ICON_OPTIONS = ['Promo', 'Jeu', 'Cocktail', 'Tournoi', 'Concert'];

const EMPTY: EventData = {
  name: '',
  description: '',
  date: '',
  icon: null,
  active: true,
  cta_redirect_url: null,
};

export default function EventModal({ initial, onSave, onClose }: Props) {
  const [data, setData] = useState<EventData>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) {
      setData({
        ...initial,
        date: initial.date ? initial.date.slice(0, 16) : '',
      });
    } else {
      setData(EMPTY);
    }
  }, [initial]);

  function set<K extends keyof EventData>(k: K, v: EventData[K]) {
    setData((s) => ({ ...s, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!data.name.trim() || !data.date) return;
    setSaving(true);
    try {
      await onSave({
        ...data,
        name: data.name.trim(),
        description: (data.description ?? '').trim(),
        date: new Date(data.date).toISOString(),
        cta_redirect_url: data.cta_redirect_url?.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold">
            {initial?.id ? "Modifier l'évènement" : 'Nouvel évènement'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
            <input
              type="text"
              value={data.name}
              onChange={(e) => set('name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={data.description}
              onChange={(e) => set('description', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input
                type="datetime-local"
                value={data.date}
                onChange={(e) => set('date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Icône</label>
              <select
                value={data.icon ?? ''}
                onChange={(e) => set('icon', e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="">— Aucune —</option>
                {ICON_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              URL de redirection (CTA tables)
            </label>
            <input
              type="text"
              value={data.cta_redirect_url ?? ''}
              onChange={(e) => set('cta_redirect_url', e.target.value)}
              placeholder="ex: http://localhost/quizz.php"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 font-mono text-xs"
            />
            <p className="text-xs text-gray-500 mt-1">
              Si renseigne, un bouton "Rejoindre" s'affichera sur l'ecran d'accueil des
              tables tactiles quand l'event sera live (declenche depuis invader_admin).
            </p>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={data.active}
              onChange={(e) => set('active', e.target.checked)}
            />
            <span className="text-sm">Actif</span>
          </label>

          <div className="flex justify-end gap-3 pt-2 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving || !data.name.trim() || !data.date}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {initial?.id ? 'Enregistrer' : 'Creer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
