import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';

export interface ConditioningInput {
  id?: string;
  label: string;
  label_en: string;
  price: number;
  price_hh: number | null;
}

const EMPTY: ConditioningInput = {
  label: '',
  label_en: '',
  price: 0,
  price_hh: null,
};

interface Props {
  value: ConditioningInput[];
  onChange: (next: ConditioningInput[]) => void;
}

export default function ConditioningEditor({ value, onChange }: Props) {
  const update = (idx: number, patch: Partial<ConditioningInput>) => {
    onChange(value.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
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
          Conditionnements
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
          Aucun conditionnement. Sans conditionnement, le prix principal du produit est affiché.
        </p>
      ) : (
        <>
          <p className="text-xs text-amber-600">
            Si au moins un conditionnement est défini, le prix principal du produit sera ignoré côté tables tactiles.
          </p>
          <div className="space-y-1.5">
            {value.map((c, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200"
              >
                <input
                  type="text"
                  placeholder="Label (ex: 33cl)"
                  value={c.label}
                  onChange={(e) => update(idx, { label: e.target.value })}
                  className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500"
                />
                <input
                  type="text"
                  placeholder="Label EN"
                  value={c.label_en}
                  onChange={(e) => update(idx, { label_en: e.target.value })}
                  className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Prix"
                  value={c.price}
                  onChange={(e) => update(idx, { price: parseFloat(e.target.value) || 0 })}
                  className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="HH"
                  value={c.price_hh ?? ''}
                  onChange={(e) =>
                    update(idx, {
                      price_hh: e.target.value ? parseFloat(e.target.value) : null,
                    })
                  }
                  className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500"
                />
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
        </>
      )}
    </div>
  );
}
