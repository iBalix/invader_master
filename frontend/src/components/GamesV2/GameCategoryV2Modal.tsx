import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import FileUpload from '../Quiz/FileUpload';
import LucideIconPicker from '../CarteV2/LucideIconPicker';

export interface GameCategoryV2Data {
  id?: string;
  name: string;
  name_en: string;
  display_order: number;
  icon_name: string | null;
  color: string | null;
  texture_url: string | null;
}

interface Props {
  initial: GameCategoryV2Data | null;
  onSave: (data: GameCategoryV2Data) => Promise<void>;
  onClose: () => void;
}

export default function GameCategoryV2Modal({ initial, onSave, onClose }: Props) {
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [displayOrder, setDisplayOrder] = useState(100);
  const [iconName, setIconName] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [textureUrl, setTextureUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) {
      setName(initial.name ?? '');
      setNameEn(initial.name_en ?? '');
      setDisplayOrder(initial.display_order ?? 100);
      setIconName(initial.icon_name ?? null);
      setColor(initial.color ?? null);
      setTextureUrl(initial.texture_url ?? null);
    }
  }, [initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) return;
    setSaving(true);
    try {
      await onSave({
        id: initial?.id,
        name: name.trim(),
        name_en: nameEn.trim(),
        display_order: displayOrder,
        icon_name: iconName,
        color,
        texture_url: textureUrl,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold">
            {initial?.id ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom (FR) *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom (EN)</label>
              <input
                type="text"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ordre</label>
            <input
              type="number"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 100)}
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-400">Tri croissant : les valeurs les plus basses apparaissent en premier</p>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Icône</label>
            <LucideIconPicker value={iconName} onChange={setIconName} />
          </div>

          <div className="border-t border-gray-200 pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Couleur</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color ?? '#7c3aed'}
                onChange={(e) => setColor(e.target.value)}
                className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
              />
              <input
                type="text"
                value={color ?? ''}
                onChange={(e) => setColor(e.target.value || null)}
                placeholder="#RRGGBB"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              {color && (
                <button
                  type="button"
                  onClick={() => setColor(null)}
                  className="px-2 py-1 text-xs text-gray-500 hover:text-red-500"
                >
                  Effacer
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-400">Teinte appliquée en fallback si aucune texture n'est définie.</p>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <FileUpload
              label="Texture (fond du bouton sidebar)"
              accept="image/*"
              value={textureUrl}
              onChange={setTextureUrl}
            />
            <p className="mt-1 text-xs text-gray-400">
              Bandeau large, idéalement 800 x 220 px (environ 3,6:1). Affichée 262 x 72 px en fond
              du bouton de catégorie sur la table, avec un dégradé noir qui couvre les deux tiers
              gauches : garder le motif intéressant à droite et n'y mettre aucun texte.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-200">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
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
