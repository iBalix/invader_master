import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';

export interface VariantInput {
  id?: string;
  label: string;
  label_en: string;
  color: string | null;
}

const EMPTY: VariantInput = {
  label: '',
  label_en: '',
  color: null,
};

interface Props {
  value: VariantInput[];
  onChange: (next: VariantInput[]) => void;
}

export default function VariantEditor({ value, onChange }: Props) {
  const update = (idx: number, patch: Partial<VariantInput>) => {
    onChange(value.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));
  const add = () => onChange([...value, { ...EMPTY }]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          Variantes (parfums, goûts…)
        </label>
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-primary-500 text-white rounded hover:bg-primary-600 transition"
        >
          <Plus className="w-3 h-3" /> Ajouter
        </button>
      </div>
      {value.length === 0 ? (
        <p className="text-xs text-gray-400 italic">
          Aucune variante. Les variantes affichent des pastilles colorées sur la ligne produit côté tables.
        </p>
      ) : (
        <div className="space-y-1.5">
          {value.map((v, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200"
            >
              <input
                type="text"
                placeholder="Label (ex: Fraise)"
                value={v.label}
                onChange={(e) => update(idx, { label: e.target.value })}
                className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500"
              />
              <input
                type="text"
                placeholder="Label EN"
                value={v.label_en}
                onChange={(e) => update(idx, { label_en: e.target.value })}
                className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500"
              />
              <input
                type="color"
                value={v.color ?? '#cccccc'}
                onChange={(e) => update(idx, { color: e.target.value })}
                className="w-10 h-8 border border-gray-300 rounded cursor-pointer"
                title="Couleur"
              />
              <button
                type="button"
                onClick={() => update(idx, { color: null })}
                className="text-xs text-gray-400 hover:text-gray-600"
                title="Effacer couleur"
              >
                ×
              </button>
              <button
                type="button"
                onClick={() => move(idx, idx - 1)}
                disabled={idx === 0}
                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                title="Monter"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => move(idx, idx + 1)}
                disabled={idx === value.length - 1}
                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                title="Descendre"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => remove(idx)}
                className="p-1 text-gray-400 hover:text-red-500"
                title="Supprimer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
