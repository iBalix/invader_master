import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';

export interface BattleQuestionData {
  id?: number;
  question: string;
  difficulty: string;
  theme: string;
  answers: string[];
  correctAnswer: number;
  help_story: string;
}

interface Props {
  initial: BattleQuestionData | null;
  categories: string[];
  currentDifficulty: string;
  onSave: (data: BattleQuestionData) => Promise<void>;
  onClose: () => void;
}

const DIFFICULTIES = ['Facile', 'Moyen', 'Difficile'];
const ANSWER_LETTERS = ['A', 'B', 'C', 'D'];

export default function BattleQuestionModal({ initial, categories, currentDifficulty, onSave, onClose }: Props) {
  const [question, setQuestion] = useState('');
  const [difficulty, setDifficulty] = useState(currentDifficulty);
  const [theme, setTheme] = useState('');
  const [answers, setAnswers] = useState(['', '', '', '']);
  const [correctAnswer, setCorrectAnswer] = useState(0);
  const [helpStory, setHelpStory] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) {
      setQuestion(initial.question);
      setDifficulty(initial.difficulty);
      setTheme(initial.theme);
      const clean = initial.answers.map((a) => a.replace(' (OK)', ''));
      setAnswers(clean);
      const correctIdx = initial.answers.findIndex((a) => a.includes('(OK)'));
      setCorrectAnswer(correctIdx >= 0 ? correctIdx : initial.correctAnswer ?? 0);
      setHelpStory(initial.help_story ?? '');
    } else {
      setDifficulty(currentDifficulty);
      if (categories.length > 0) setTheme(categories[0]);
    }
  }, [initial, currentDifficulty, categories]);

  const setAnswer = (index: number, value: string) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !theme.trim() || answers.some((a) => !a.trim())) return;
    setSaving(true);
    try {
      await onSave({
        id: initial?.id,
        question: question.trim(),
        difficulty,
        theme,
        answers: answers.map((a) => a.trim()),
        correctAnswer,
        help_story: helpStory.trim(),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-xl z-10">
          <h2 className="text-lg font-bold">
            {initial?.id ? 'Modifier la question' : 'Ajouter une question'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Difficulté *</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie *</label>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Question *</label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Réponses *</label>
            <div className="grid grid-cols-2 gap-3">
              {ANSWER_LETTERS.map((letter, i) => (
                <div key={letter} className="flex items-center gap-2">
                  <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-600">
                    {letter}
                  </span>
                  <input
                    type="text"
                    value={answers[i]}
                    onChange={(e) => setAnswer(i, e.target.value)}
                    placeholder={`Réponse ${letter}`}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                    required
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bonne réponse *</label>
            <div className="flex gap-2">
              {ANSWER_LETTERS.map((letter, i) => (
                <button
                  key={letter}
                  type="button"
                  onClick={() => setCorrectAnswer(i)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    correctAnswer === i
                      ? 'bg-green-500 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {letter}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Anecdote <span className="text-gray-400 font-normal">(optionnel)</span>
            </label>
            <textarea
              value={helpStory}
              onChange={(e) => setHelpStory(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
              placeholder="Un fait amusant ou surprenant lié à la question..."
            />
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
              disabled={saving || !question.trim() || !theme.trim() || answers.some((a) => !a.trim())}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {initial?.id ? 'Enregistrer' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
