import { useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';

/**
 * Génération de questions par IA, en pop-up.
 *
 * Le formulaire vivait en permanence dans la colonne de gauche de la page,
 * où il prenait la place des filtres. On ne génère que quelques fois par
 * soirée : une fenêtre qu'on ouvre quand on en a besoin suffit.
 */

export interface GenerateParams {
  difficulty: string;
  category: string;
  hint: string;
  count: number;
}

interface Props {
  categories: string[];
  currentDifficulty: string;
  onGenerate: (params: GenerateParams) => Promise<void>;
  onClose: () => void;
}

const DIFFICULTIES = ['Facile', 'Moyen', 'Difficile'];

export default function BattleGenerateModal({ categories, currentDifficulty, onGenerate, onClose }: Props) {
  const [difficulty, setDifficulty] = useState(currentDifficulty);
  const [category, setCategory] = useState('random');
  const [hint, setHint] = useState('');
  const [count, setCount] = useState(3);
  const [generating, setGenerating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (count < 1 || count > 10) return;
    setGenerating(true);
    try {
      await onGenerate({ difficulty, category, hint: hint.trim(), count });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b bg-gradient-to-r from-purple-500 to-indigo-500 rounded-t-xl">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Générer par IA
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            className="p-1 text-white/80 hover:text-white hover:bg-white/15 rounded-lg transition disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Difficulté</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre (1 à 10)</label>
              <input
                type="number"
                min={1}
                max={10}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="random">Aléatoire</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Indication <span className="text-gray-400 font-normal">(facultatif)</span>
            </label>
            <input
              type="text"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="Ex : Marvel, années 80, consoles Nintendo..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={generating}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={generating || count < 1 || count > 10}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-lg hover:from-purple-600 hover:to-indigo-600 transition disabled:opacity-50"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generating ? 'Génération...' : `Générer ${count} question${count > 1 ? 's' : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
