import { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import FileUpload from './FileUpload';

const DIFFICULTIES = ['Facile', 'Moyen', 'Difficile'] as const;

const TYPES = [
  { value: 'qcm', label: 'QCM', hint: '4 réponses, une bonne' },
  { value: 'estimation', label: 'Estimation', hint: 'Réponse chiffrée, points par écart' },
  { value: 'free_text', label: 'Réponse libre', hint: 'Champ libre, jugé par IA' },
] as const;

export interface EstimationTier {
  maxGap: number;
  points: number;
}

export interface QuestionData {
  id?: string;
  question: string;
  type: 'qcm' | 'estimation' | 'free_text';
  points_override: number | null;
  difficulty: string[];
  answers: string[];
  correct_answer_index: number;
  expected_answer: string | null;
  expected_number: number | null;
  estimation_scoring: EstimationTier[] | null;
  help_animator: string;
  music_url: string | null;
  video_youtube: string;
  image_question_url: string | null;
  image_answer_url: string | null;
}

const DEFAULT_TIERS: EstimationTier[] = [
  { maxGap: 5, points: 3 },
  { maxGap: 20, points: 2 },
  { maxGap: 50, points: 1 },
];

const EMPTY: QuestionData = {
  question: '',
  type: 'qcm',
  points_override: null,
  difficulty: [],
  answers: ['', '', '', ''],
  correct_answer_index: 0,
  expected_answer: null,
  expected_number: null,
  estimation_scoring: null,
  help_animator: '',
  music_url: null,
  video_youtube: '',
  image_question_url: null,
  image_answer_url: null,
};

interface Props {
  initial?: QuestionData | null;
  onSave: (data: QuestionData) => void;
  onClose: () => void;
  saving?: boolean;
}

export default function QuestionModal({ initial, onSave, onClose, saving }: Props) {
  const [form, setForm] = useState<QuestionData>({ ...EMPTY });

  useEffect(() => {
    if (initial) {
      const ans = [...initial.answers];
      while (ans.length < 4) ans.push('');
      setForm({ ...EMPTY, ...initial, type: initial.type ?? 'qcm', answers: ans });
    } else {
      setForm({ ...EMPTY, answers: ['', '', '', ''] });
    }
  }, [initial]);

  const set = <K extends keyof QuestionData>(key: K, val: QuestionData[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const setDifficulty = (d: string) => {
    set('difficulty', form.difficulty[0] === d ? [] : [d]);
  };

  const setAnswer = (i: number, val: string) => {
    const next = [...form.answers];
    next[i] = val;
    set('answers', next);
  };

  const tiers = form.estimation_scoring ?? DEFAULT_TIERS;
  const setTier = (i: number, key: keyof EstimationTier, val: number) => {
    const next = tiers.map((t, j) => (j === i ? { ...t, [key]: val } : t));
    set('estimation_scoring', next);
  };

  const valid =
    form.question.trim() !== '' &&
    form.difficulty.length > 0 &&
    (form.type === 'qcm'
      ? form.answers.length === 4 && form.answers.every((a) => a.trim() !== '')
      : form.type === 'estimation'
        ? form.expected_number !== null &&
          tiers.length > 0 &&
          tiers.every((t) => t.maxGap >= 0 && t.points >= 0)
        : (form.expected_answer ?? '').trim() !== '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSave({
      ...form,
      answers: form.type === 'qcm' ? form.answers.filter((a) => a.trim()) : [],
      expected_answer: form.type === 'free_text' ? form.expected_answer : null,
      expected_number: form.type === 'estimation' ? form.expected_number : null,
      estimation_scoring:
        form.type === 'estimation'
          ? [...tiers].sort((a, b) => a.maxGap - b.maxGap)
          : null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold">{initial?.id ? 'Modifier la question' : 'Nouvelle question'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Question text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Question *</label>
            <input
              type="text"
              value={form.question}
              onChange={(e) => set('question', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              required
            />
          </div>

          {/* Type de question */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type de question *</label>
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => set('type', t.value)}
                  className={`rounded-lg border px-3 py-2 text-left transition ${
                    form.type === t.value
                      ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                      : 'border-gray-300 bg-white hover:border-primary-400'
                  }`}
                >
                  <span className="block text-sm font-semibold">{t.label}</span>
                  <span className="block text-xs text-gray-400">{t.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Difficulté + points */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Difficulté *</label>
              <div className="flex gap-2">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                      form.difficulty[0] === d
                        ? 'bg-primary-500 text-white border-primary-500'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Points <span className="text-gray-400 font-normal">(vide = barème difficulté)</span>
              </label>
              <select
                value={form.points_override ?? ''}
                onChange={(e) =>
                  set('points_override', e.target.value === '' ? null : parseInt(e.target.value, 10))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Auto (Facile 1 / Moyen 2 / Difficile 3)</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n} point{n > 1 ? 's' : ''}</option>
                ))}
              </select>
            </div>
          </div>

          {/* QCM : 4 réponses */}
          {form.type === 'qcm' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                4 réponses * <span className="text-gray-400 font-normal">(sélectionnez la bonne)</span>
              </label>
              <div className="space-y-2">
                {form.answers.map((ans, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => set('correct_answer_index', i)}
                      className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition ${
                        form.correct_answer_index === i
                          ? 'bg-green-500 border-green-500 text-white'
                          : 'border-gray-300 hover:border-green-400'
                      }`}
                      title="Marquer comme bonne réponse"
                    >
                      {form.correct_answer_index === i && <Check className="w-3.5 h-3.5" />}
                    </button>
                    <input
                      type="text"
                      value={ans}
                      onChange={(e) => setAnswer(i, e.target.value)}
                      placeholder={`Réponse ${i + 1}`}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Estimation : réponse + paliers */}
          {form.type === 'estimation' && (
            <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bonne réponse (nombre) *</label>
                <input
                  type="number"
                  step="any"
                  value={form.expected_number ?? ''}
                  onChange={(e) =>
                    set('expected_number', e.target.value === '' ? null : parseFloat(e.target.value))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Paliers de points par écart *{' '}
                  <span className="text-gray-400 font-normal">(du plus précis au plus large)</span>
                </label>
                <div className="space-y-2">
                  {tiers.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-gray-500">Écart ≤</span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={t.maxGap}
                        onChange={(e) => setTier(i, 'maxGap', parseFloat(e.target.value) || 0)}
                        className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg"
                      />
                      <span className="text-gray-500">→</span>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={t.points}
                        onChange={(e) => setTier(i, 'points', parseInt(e.target.value, 10) || 0)}
                        className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg"
                      />
                      <span className="text-gray-500">pts</span>
                      <button
                        type="button"
                        onClick={() => set('estimation_scoring', tiers.filter((_, j) => j !== i))}
                        className="ml-auto p-1 text-gray-400 hover:text-red-500"
                        title="Supprimer ce palier"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    set('estimation_scoring', [
                      ...tiers,
                      { maxGap: (tiers[tiers.length - 1]?.maxGap ?? 0) * 2 || 10, points: 1 },
                    ])
                  }
                  className="mt-2 text-sm font-medium text-primary-600 hover:text-primary-700"
                >
                  + Ajouter un palier
                </button>
                {form.expected_number !== null && tiers.length > 0 && (
                  <p className="mt-2 text-xs text-gray-500">
                    Aperçu :{' '}
                    {[...tiers]
                      .sort((a, b) => a.maxGap - b.maxGap)
                      .map((t) => `entre ${form.expected_number! - t.maxGap} et ${form.expected_number! + t.maxGap} → ${t.points} pts`)
                      .join(' · ')}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Réponse libre : réponse attendue */}
          {form.type === 'free_text' && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Réponse attendue *</label>
              <input
                type="text"
                value={form.expected_answer ?? ''}
                onChange={(e) => set('expected_answer', e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                L'IA acceptera les fautes d'orthographe, abréviations et reformulations proches.
                Le gamemaster peut corriger chaque verdict avant la révélation.
              </p>
            </div>
          )}

          {/* Help animator */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Aide animateur</label>
            <input
              type="text"
              value={form.help_animator}
              onChange={(e) => set('help_animator', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {/* Video YouTube */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vidéo YouTube</label>
            <input
              type="text"
              value={form.video_youtube}
              onChange={(e) => set('video_youtube', e.target.value)}
              placeholder="ID_VIDEO?time=5&duration=50"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-400">
              Format : <span className="font-mono text-gray-500">ID?time=SECONDES&duration=SECONDES</span> — Ex : <span className="font-mono text-gray-500">dQw4w9WgXcQ?time=5&duration=50</span> (démarre à 5s, dure 50s)
            </p>
          </div>

          {/* Media uploads */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FileUpload label="Musique" accept="audio/*" value={form.music_url} onChange={(v) => set('music_url', v)} />
            <FileUpload label="Image (question)" accept="image/*" value={form.image_question_url} onChange={(v) => set('image_question_url', v)} />
            <FileUpload label="Image (réponse)" accept="image/*" value={form.image_answer_url} onChange={(v) => set('image_answer_url', v)} />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
              Annuler
            </button>
            <button
              type="submit"
              disabled={!valid || saving}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition disabled:opacity-50"
            >
              {saving ? 'Enregistrement...' : initial?.id ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
