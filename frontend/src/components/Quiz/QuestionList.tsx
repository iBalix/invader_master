import { GripVertical, Pencil, X, ChevronUp, ChevronDown } from 'lucide-react';
import type { QuestionData } from './QuestionModal';

const DIFF_COLORS: Record<string, string> = {
  Facile: 'bg-green-100 text-green-700',
  Moyen: 'bg-yellow-100 text-yellow-700',
  Difficile: 'bg-red-100 text-red-700',
};

const TYPE_BADGES: { key: keyof QuestionData; label: string; style: string }[] = [
  { key: 'video_youtube', label: 'Vidéo', style: 'bg-red-50 text-red-600' },
  { key: 'music_url', label: 'Musique', style: 'bg-purple-50 text-purple-600' },
  { key: 'image_question_url', label: 'Image', style: 'bg-sky-50 text-sky-600' },
];

interface Props {
  questions: QuestionData[];
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
  onMove: (from: number, to: number) => void;
}

export default function QuestionList({ questions, onEdit, onRemove, onMove }: Props) {
  if (questions.length === 0) {
    return (
      <p className="text-gray-400 text-center py-8">
        Aucune question associée. Créez ou ajoutez des questions ci-dessous.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {questions.map((q, i) => (
        <div
          key={q.id ?? `new-${i}`}
          className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 group hover:border-gray-300 transition"
        >
          <div className="flex flex-col gap-0.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => onMove(i, i - 1)}
              disabled={i === 0}
              className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <GripVertical className="w-4 h-4 text-gray-300" />
            <button
              type="button"
              onClick={() => onMove(i, i + 1)}
              disabled={i === questions.length - 1}
              className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{q.question || '(sans texte)'}</p>
            <div className="flex items-center gap-2 mt-1">
              {q.difficulty.map((d) => (
                <span key={d} className={`text-xs px-1.5 py-0.5 rounded ${DIFF_COLORS[d] ?? 'bg-gray-100 text-gray-600'}`}>
                  {d}
                </span>
              ))}
              {TYPE_BADGES.filter((t) => q[t.key]).map((t) => (
                <span key={t.key} className={`text-xs px-1.5 py-0.5 rounded font-medium ${t.style}`}>
                  {t.label}
                </span>
              ))}
              {q.answers[q.correct_answer_index]?.trim() && (
                <span className="text-xs text-green-600">
                  ✓ {q.answers[q.correct_answer_index]}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
            <button
              type="button"
              onClick={() => onEdit(i)}
              className="p-1.5 text-gray-400 hover:text-primary-500 transition"
              title="Modifier"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="p-1.5 text-gray-400 hover:text-red-500 transition"
              title="Retirer du quiz"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
