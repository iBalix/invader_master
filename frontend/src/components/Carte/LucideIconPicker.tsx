import { useState } from 'react';
import { Search } from 'lucide-react';
import LucideIcon from '../../lib/LucideIcon';

const CURATED_ICONS = [
  'Beer', 'Wine', 'Martini', 'GlassWater', 'CupSoda', 'Coffee', 'Milk',
  'Pizza', 'Sandwich', 'Salad', 'Soup', 'IceCream', 'IceCreamCone', 'Cookie',
  'Croissant', 'Cake', 'CakeSlice', 'Donut', 'Drumstick', 'Egg', 'EggFried',
  'Fish', 'Beef', 'Ham', 'Apple', 'Cherry', 'Citrus', 'Grape', 'Banana',
  'Carrot', 'Leaf', 'UtensilsCrossed', 'Utensils', 'ChefHat', 'CookingPot',
  'Flame', 'Sparkles', 'Star', 'Heart', 'Trophy', 'Gift', 'PartyPopper',
  'Music', 'Gamepad2',
];

interface Props {
  value: string | null;
  onChange: (name: string | null) => void;
}

export default function LucideIconPicker({ value, onChange }: Props) {
  const [search, setSearch] = useState('');

  const filtered = CURATED_ICONS.filter((n) =>
    n.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une icône..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="px-2 py-1 text-xs text-gray-500 hover:text-red-500"
          >
            Effacer
          </button>
        )}
      </div>
      <div className="grid grid-cols-8 gap-1.5 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2 bg-gray-50">
        {filtered.map((name) => {
          const active = value === name;
          return (
            <button
              key={name}
              type="button"
              onClick={() => onChange(name)}
              title={name}
              className={`flex items-center justify-center aspect-square rounded-md transition ${
                active
                  ? 'bg-primary-500 text-white ring-2 ring-primary-300'
                  : 'bg-white hover:bg-gray-100 text-gray-700'
              }`}
            >
              <LucideIcon name={name} className="w-4 h-4" />
            </button>
          );
        })}
      </div>
      {value && (
        <p className="text-xs text-gray-500 flex items-center gap-1.5">
          Sélection : <LucideIcon name={value} className="w-3.5 h-3.5" /> <span className="font-mono">{value}</span>
        </p>
      )}
    </div>
  );
}
