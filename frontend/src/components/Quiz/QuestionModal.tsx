import { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import FileUpload from './FileUpload';

const DIFFICULTIES = ['Facile', 'Moyen', 'Difficile'] as const;

export interface QuestionData {
  id?: string;
  question: string;
  difficulty: string[];
  answers: string[];
  correct_answer_index: number;
  help_animator: string;
  music_url: string | null;
  video_youtube: string;
  image_question_url: string | null;
  image_answer_url: string | null;
}

const EMPTY: QuestionData = {
  question: '',
  difficulty: [],
  answers: ['', '', '', ''],
  correct_answer_index: 0,
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
      setForm({ ...initial, answers: ans });
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

  const valid =
    form.question.trim() !== '' &&
    form.difficulty.length > 0 &&
    form.answers.length === 4 &&
    form.answers.every((a) => a.trim() !== '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSave({
      ...form,
      answers: form.answers.filter((a) => a.trim()),
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

          {/* Difficulty */}
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

          {/* Answers (exactly 4) */}
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
