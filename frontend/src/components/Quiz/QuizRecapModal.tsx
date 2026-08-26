import { useState, useEffect, useRef } from 'react';
import { X, Loader2, CheckCircle2, AlertTriangle, Video, Music, Image, FileImage } from 'lucide-react';
import { api } from '../../lib/api';

type MediaPreview =
  | { type: 'image'; url: string; label: string }
  | { type: 'audio'; url: string; label: string }
  | { type: 'video'; url: string; label: string }
  | null;

interface YtInfo { id: string; start?: number }

function parseYouTube(url: string): YtInfo | null {
  if (!url) return null;
  const trimmed = url.trim();

  let id: string | null = null;
  const full = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  if (full) id = full[1];
  if (!id) {
    const bare = trimmed.match(/^([a-zA-Z0-9_-]{11})(?:\?.*)?$/);
    if (bare) id = bare[1];
  }
  if (!id) return null;

  const qs = trimmed.split('?')[1];
  let start: number | undefined;
  if (qs) {
    const params = new URLSearchParams(qs);
    const t = params.get('time') ?? params.get('t') ?? params.get('start');
    if (t) start = parseInt(t, 10) || undefined;
  }
  return { id, start };
}

type TypeQuestion = 'qcm' | 'estimation' | 'free_text';

interface EstimationTier {
  maxGap: number;
  points: number;
}

interface Question {
  id: string;
  question: string;
  /** absent sur les questions anterieures a migration-040, d'ou le repli sur qcm */
  type?: TypeQuestion | null;
  answers: string[];
  correct_answer_index: number;
  expected_answer?: string | null;
  expected_number?: number | null;
  estimation_scoring?: EstimationTier[] | null;
  difficulty: string[];
  music_url: string | null;
  video_youtube: string;
  image_question_url: string | null;
  image_answer_url: string | null;
}

const LIBELLES_TYPE: Record<TypeQuestion, string> = {
  qcm: 'QCM',
  estimation: 'Estimation',
  free_text: 'Réponse libre',
};

const COULEURS_TYPE: Record<TypeQuestion, string> = {
  qcm: 'bg-blue-100 text-blue-700',
  estimation: 'bg-violet-100 text-violet-700',
  free_text: 'bg-teal-100 text-teal-700',
};

function typeDe(q: Question): TypeQuestion {
  return q.type === 'estimation' || q.type === 'free_text' ? q.type : 'qcm';
}

interface QuizDetail {
  id: string;
  name: string;
  theme: string;
  published: boolean;
  questions: Question[];
}

interface Props {
  quizId: string;
  quizName: string;
  onClose: () => void;
}

/**
 * Verifie une question selon SON type.
 *
 * La version precedente appliquait les regles du QCM a tout le monde : elle
 * exigeait au moins deux reponses et un index de bonne reponse valide. Or une
 * estimation et une reponse libre n'ont volontairement AUCUNE reponse en base
 * (cf. QuestionModal, qui enregistre `answers: []` pour ces deux types). Toute
 * question de ces types etait donc comptee incomplete, et la modale annoncait
 * un quiz cassé alors qu'il etait parfaitement valide.
 *
 * Les regles reprennent une a une celles du formulaire de question, qui fait
 * foi : si le formulaire accepte d'enregistrer, la modale doit accepter aussi.
 *
 * On renvoie le motif et pas seulement un booleen : « incomplete » n'aide
 * personne, « pas de valeur attendue » se corrige en dix secondes.
 */
function verifierQuestion(q: Question): { ok: boolean; probleme?: string } {
  if (!q.question?.trim()) return { ok: false, probleme: 'Question vide' };
  if (!(q.difficulty ?? []).length) return { ok: false, probleme: 'Aucune difficulté' };

  switch (typeDe(q)) {
    case 'estimation': {
      if (q.expected_number === null || q.expected_number === undefined) {
        return { ok: false, probleme: 'Pas de valeur attendue' };
      }
      const paliers = q.estimation_scoring ?? [];
      if (paliers.length === 0) return { ok: false, probleme: 'Aucun palier de points' };
      if (paliers.some((t) => !(t.maxGap >= 0) || !(t.points >= 0))) {
        return { ok: false, probleme: 'Palier de points invalide' };
      }
      return { ok: true };
    }
    case 'free_text': {
      if (!(q.expected_answer ?? '').trim()) {
        return { ok: false, probleme: 'Pas de réponse attendue' };
      }
      return { ok: true };
    }
    default: {
      const reponses = q.answers ?? [];
      const remplies = reponses.filter((a) => (a ?? '').trim().length > 0);
      if (remplies.length < 4) {
        return { ok: false, probleme: `${remplies.length}/4 réponses remplies` };
      }
      const idx = q.correct_answer_index ?? 0;
      if (idx < 0 || idx >= reponses.length || !(reponses[idx] ?? '').trim()) {
        return { ok: false, probleme: 'Pas de bonne réponse désignée' };
      }
      return { ok: true };
    }
  }
}

export default function QuizRecapModal({ quizId, quizName, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [quiz, setQuiz] = useState<QuizDetail | null>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<MediaPreview>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/api/quizzes/${quizId}`);
        setQuiz(data.quiz);
      } catch {
        setError('Impossible de charger le quiz');
      } finally {
        setLoading(false);
      }
    })();
  }, [quizId]);

  const questions: Question[] = quiz?.questions ?? [];
  const total = questions.length;
  const complete = questions.filter((q) => verifierQuestion(q).ok).length;
  const parType = questions.reduce<Record<string, number>>((acc, q) => {
    const t = typeDe(q);
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});
  const incomplete = total - complete;
  const withVideo = questions.filter((q) => q.video_youtube?.trim()).length;
  const withAudio = questions.filter((q) => q.music_url?.trim()).length;
  const withImage = questions.filter((q) => q.image_question_url?.trim() || q.image_answer_url?.trim()).length;
  const allComplete = total > 0 && incomplete === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-bold truncate">Récap — {quizName}</h2>
            {quiz && (
              <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                <span>Thème : {quiz.theme || '—'}</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  quiz.published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {quiz.published ? 'Publié' : 'Draft'}
                </span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-3 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Chargement du quiz...</span>
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : (
            <>
              {/* Global status */}
              <div className={`flex items-center gap-2 p-3 rounded-lg text-sm font-medium ${
                allComplete
                  ? 'bg-green-50 border border-green-200 text-green-700'
                  : 'bg-amber-50 border border-amber-200 text-amber-700'
              }`}>
                {allComplete ? (
                  <><CheckCircle2 className="w-5 h-5 shrink-0" /> Quiz complet — toutes les questions sont valides</>
                ) : (
                  <><AlertTriangle className="w-5 h-5 shrink-0" /> {incomplete} question{incomplete > 1 ? 's' : ''} incomplète{incomplete > 1 ? 's' : ''} sur {total}</>
                )}
              </div>

              {/* Repartition par type : seuls les types presents sont affiches, pour
                  ne pas encombrer un quiz 100 % QCM d'un compteur a zero. */}
              {total > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-gray-500">Types&nbsp;:</span>
                  {(Object.keys(LIBELLES_TYPE) as TypeQuestion[])
                    .filter((t) => (parType[t] ?? 0) > 0)
                    .map((t) => (
                      <span
                        key={t}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${COULEURS_TYPE[t]}`}
                      >
                        {LIBELLES_TYPE[t]} <span className="tabular-nums opacity-70">{parType[t]}</span>
                      </span>
                    ))}
                </div>
              )}

              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard label="Total questions" value={total} color="blue" />
                <StatCard label="Complètes" value={complete} color="green" />
                <StatCard label="Incomplètes" value={incomplete} color={incomplete > 0 ? 'red' : 'green'} />
                <StatCard label="Avec vidéo" value={withVideo} icon={<Video className="w-4 h-4" />} color="purple" />
                <StatCard label="Avec audio" value={withAudio} icon={<Music className="w-4 h-4" />} color="orange" />
                <StatCard label="Avec image" value={withImage} icon={<Image className="w-4 h-4" />} color="cyan" />
              </div>

              {/* Questions list */}
              {total > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Détail des questions</h3>
                  <div className="space-y-2">
                    {questions.map((q, i) => {
                      const { ok, probleme } = verifierQuestion(q);
                      const type = typeDe(q);
                      return (
                        <div
                          key={q.id}
                          className={`p-3 rounded-lg border text-sm ${
                            ok ? 'border-gray-200 bg-white' : 'border-red-300 bg-red-50'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <span className="shrink-0 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                              {i + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-gray-800 line-clamp-2">
                                {q.question || <span className="italic text-gray-400">Question vide</span>}
                              </p>
                              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${COULEURS_TYPE[type]}`}
                                >
                                  {LIBELLES_TYPE[type]}
                                </span>

                                {/* Ce qui fait office de bonne reponse depend du
                                    type : une case cochee pour un QCM, une valeur
                                    et ses paliers pour une estimation, un texte
                                    attendu pour une reponse libre. */}
                                {ok && <ResumeReponse question={q} type={type} />}

                                {!ok && probleme && (
                                  <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                                    <AlertTriangle className="w-3 h-3" /> {probleme}
                                  </span>
                                )}
                                {/* Media indicators — clickable */}
                                {q.video_youtube?.trim() && (
                                  <button
                                    type="button"
                                    onClick={() => setPreview({ type: 'video', url: q.video_youtube, label: `Q${i + 1} — Vidéo` })}
                                    className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 hover:underline cursor-pointer"
                                    title="Voir la vidéo"
                                  >
                                    <Video className="w-3.5 h-3.5" /> Vidéo
                                  </button>
                                )}
                                {q.music_url?.trim() && (
                                  <button
                                    type="button"
                                    onClick={() => setPreview({ type: 'audio', url: q.music_url!, label: `Q${i + 1} — Audio` })}
                                    className="inline-flex items-center gap-1 text-xs text-orange-600 hover:text-orange-800 hover:underline cursor-pointer"
                                    title="Écouter l'audio"
                                  >
                                    <Music className="w-3.5 h-3.5" /> Audio
                                  </button>
                                )}
                                {q.image_question_url?.trim() && (
                                  <button
                                    type="button"
                                    onClick={() => setPreview({ type: 'image', url: q.image_question_url!, label: `Q${i + 1} — Image question` })}
                                    className="inline-flex items-center gap-1 text-xs text-cyan-600 hover:text-cyan-800 hover:underline cursor-pointer"
                                    title="Voir l'image question"
                                  >
                                    <Image className="w-3.5 h-3.5" /> Img Q
                                  </button>
                                )}
                                {q.image_answer_url?.trim() && (
                                  <button
                                    type="button"
                                    onClick={() => setPreview({ type: 'image', url: q.image_answer_url!, label: `Q${i + 1} — Image réponse` })}
                                    className="inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800 hover:underline cursor-pointer"
                                    title="Voir l'image réponse"
                                  >
                                    <FileImage className="w-3.5 h-3.5" /> Img R
                                  </button>
                                )}
                              </div>
                            </div>
                            {!ok && (
                              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-1" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-5 border-t shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Fermer
          </button>
        </div>
      </div>

      {preview && (
        <MediaLightbox preview={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

/** ce qui tient lieu de « bonne reponse », selon le type de question */
function ResumeReponse({ question, type }: { question: Question; type: TypeQuestion }) {
  if (type === 'estimation') {
    const paliers = question.estimation_scoring ?? [];
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
        <CheckCircle2 className="w-3 h-3" /> {question.expected_number}
        <span className="opacity-70">
          · {paliers.length} palier{paliers.length > 1 ? 's' : ''}
        </span>
      </span>
    );
  }
  if (type === 'free_text') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
        <CheckCircle2 className="w-3 h-3" /> {question.expected_answer}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
      <CheckCircle2 className="w-3 h-3" /> {question.answers?.[question.correct_answer_index]}
    </span>
  );
}

const COLORS: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-green-50 text-green-700',
  red: 'bg-red-50 text-red-700',
  purple: 'bg-purple-50 text-purple-700',
  orange: 'bg-orange-50 text-orange-700',
  cyan: 'bg-cyan-50 text-cyan-700',
};

function MediaLightbox({ preview, onClose }: { preview: NonNullable<MediaPreview>; onClose: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const yt = preview.type === 'video' ? parseYouTube(preview.url) : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="relative bg-white rounded-xl shadow-2xl max-w-3xl w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-sm font-semibold text-gray-700">{preview.label}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 flex items-center justify-center min-h-[200px]">
          {preview.type === 'image' && (
            <img
              src={preview.url}
              alt={preview.label}
              className="max-h-[60vh] max-w-full object-contain rounded-lg"
            />
          )}

          {preview.type === 'audio' && (
            <div className="flex flex-col items-center gap-4 py-6 w-full">
              <Music className="w-12 h-12 text-orange-400" />
              <audio ref={audioRef} controls autoPlay className="w-full max-w-md">
                <source src={preview.url} />
              </audio>
            </div>
          )}

          {preview.type === 'video' && yt && (
            <div className="w-full aspect-video">
              <iframe
                src={`https://www.youtube.com/embed/${yt.id}?autoplay=1${yt.start ? `&start=${yt.start}` : ''}`}
                allow="autoplay; encrypted-media"
                allowFullScreen
                className="w-full h-full rounded-lg"
              />
            </div>
          )}

          {preview.type === 'video' && !yt && (
            <div className="text-center py-8 text-gray-500">
              <p className="mb-3">Impossible d'extraire l'ID YouTube</p>
              <a
                href={preview.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-500 hover:underline"
              >
                Ouvrir le lien dans un nouvel onglet
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon?: React.ReactNode }) {
  return (
    <div className={`rounded-lg p-3 ${COLORS[color] ?? COLORS.blue}`}>
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-xs font-medium opacity-80">{label}</span>
      </div>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}
