import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import FileUpload from '../Quiz/FileUpload';

export interface ProductData {
  id?: string;
  name: string;
  name_en: string;
  description: string;
  description_en: string;
  subtitle: string;
  subtitle_en: string;
  price: number;
  price_hh: number | null;
  price_second: number | null;
  icon_url: string | null;
  image_url: string | null;
  display_order: number;
}

const EMPTY: ProductData = {
  name: '',
  name_en: '',
  description: '',
  description_en: '',
  subtitle: '',
  subtitle_en: '',
  price: 0,
  price_hh: null,
  price_second: null,
  icon_url: null,
  image_url: null,
  display_order: 100,
};

interface Props {
  initial: ProductData | null;
  onSave: (data: ProductData) => Promise<void>;
  onClose: () => void;
}

export default function ProductModal({ initial, onSave, onClose }: Props) {
  const [form, setForm] = useState<ProductData>({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) {
      setForm({
        id: initial.id,
        name: initial.name ?? '',
        name_en: initial.name_en ?? '',
        description: initial.description ?? '',
        description_en: initial.description_en ?? '',
        subtitle: initial.subtitle ?? '',
        subtitle_en: initial.subtitle_en ?? '',
        price: initial.price ?? 0,
        price_hh: initial.price_hh ?? null,
        price_second: initial.price_second ?? null,
        icon_url: initial.icon_url ?? null,
        image_url: initial.image_url ?? null,
        display_order: initial.display_order ?? 100,
      });
    }
  }, [initial]);

  const set = <K extends keyof ProductData>(key: K, val: ProductData[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold">
            {initial?.id ? 'Modifier le produit' : 'Nouveau produit'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
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

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prix *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={(e) => set('price', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prix HH</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.price_hh ?? ''}
                onChange={(e) =>
                  set('price_hh', e.target.value ? parseFloat(e.target.value) : null)
                }
                placeholder="—"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prix secondaire</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.price_second ?? ''}
                onChange={(e) =>
                  set('price_second', e.target.value ? parseFloat(e.target.value) : null)
                }
                placeholder="—"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ordre d'affichage</label>
            <input
              type="number"
              value={form.display_order}
              onChange={(e) => set('display_order', parseInt(e.target.value) || 100)}
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-400">
              Tri croissant : les valeurs les plus basses apparaissent en premier
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <FileUpload
                label="Icône"
                accept="image/*"
                value={form.icon_url}
                onChange={(v) => set('icon_url', v)}
              />
              <p className="mt-1 text-xs text-gray-400">Exactement 300 x 300 px</p>
            </div>
            <div>
              <FileUpload
                label="Image HD"
                accept="image/*"
                value={form.image_url}
                onChange={(v) => set('image_url', v)}
              />
              <p className="mt-1 text-xs text-gray-400">Minimum 1280 x 720 px</p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving || !form.name.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {initial?.id ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
