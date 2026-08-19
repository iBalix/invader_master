/**
 * Génération IA de questions battle (OpenAI gpt-4o) + maintien du stock.
 *
 * Partagé entre la route /api/battle-questions (bouton "Générer") et le moteur
 * battle (ensureQuestionStock : regénère quand le pool disponible d'une
 * difficulté passe sous le seuil).
 *
 * Les questions sont stockées PROPRES en Postgres (answers sans marqueur,
 * correct_answer_index séparé) ; le marqueur " (OK)" produit par le modèle est
 * parsé et validé ici (exactement 4 réponses, exactement 1 bonne).
 */

import { supabaseAdmin } from '../config/supabase.js';

export const BATTLE_DIFFICULTIES = ['Facile', 'Moyen', 'Difficile'] as const;
export type BattleDifficulty = (typeof BATTLE_DIFFICULTIES)[number];

export function isBattleDifficulty(v: string): v is BattleDifficulty {
  return (BATTLE_DIFFICULTIES as readonly string[]).includes(v);
}

export const DEFAULT_CATEGORIES = [
  'Actualités', 'Célébrités', 'Cinéma', 'Culture', 'Culture Pop',
  'France', 'Géographie', 'Histoire', 'Jeux-vidéo', 'Mathématiques',
  'Montpellier', 'Musique', 'Séries TV', 'Sport',
];

export interface BattleQuestionRow {
  id: string;
  legacy_id: number | null;
  question: string;
  answers: string[];
  correct_answer_index: number;
  difficulty: string;
  theme: string;
  help_story: string;
  used_at: string | null;
  created_at: string;
}

interface GenerateOptions {
  difficulty: BattleDifficulty;
  count: number; // 1..10
  category?: string; // 'random' ou une catégorie précise
  hint?: string;
}

interface RawGenerated {
  question?: unknown;
  theme?: unknown;
  answers?: unknown;
  help_story?: unknown;
}

/**
 * Valide et nettoie une question générée : exactement 4 réponses, exactement
 * une marquée "(OK)". Retourne null si invalide (le modèle a mal formé).
 */
function sanitizeGenerated(
  q: RawGenerated,
  fallbackTheme: string,
): { question: string; theme: string; answers: string[]; correctIndex: number; helpStory: string } | null {
  if (typeof q.question !== 'string' || !q.question.trim()) return null;
  if (!Array.isArray(q.answers) || q.answers.length !== 4) return null;
  if (!q.answers.every((a): a is string => typeof a === 'string' && a.trim().length > 0)) return null;
  const markedIndexes = q.answers
    .map((a, i) => (a.includes('(OK)') ? i : -1))
    .filter((i) => i !== -1);
  if (markedIndexes.length !== 1) return null;
  const answers = q.answers.map((a) => a.replace(' (OK)', '').replace('(OK)', '').trim());
  if (answers.some((a) => a.length === 0)) return null;
  return {
    question: q.question.trim(),
    theme: typeof q.theme === 'string' && q.theme.trim() ? q.theme.trim() : fallbackTheme,
    answers,
    correctIndex: markedIndexes[0],
    helpStory: typeof q.help_story === 'string' ? q.help_story : '',
  };
}

async function knownCategories(): Promise<string[]> {
  const { data } = await supabaseAdmin.from('battle_questions').select('theme');
  const fromDb = [...new Set((data ?? []).map((r) => r.theme as string).filter(Boolean))];
  return fromDb.length > 0 ? fromDb : DEFAULT_CATEGORIES;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Génère `count` questions et les insère en Postgres.
 * Retourne le nombre réellement inséré (les sorties IA mal formées sont jetées).
 */
export async function generateBattleQuestions(opts: GenerateOptions): Promise<number> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw Object.assign(new Error('OPENAI_API_KEY non configurée'), { httpStatus: 500 });

  const count = Math.min(10, Math.max(1, Math.floor(opts.count)));
  const category = opts.category ?? 'random';
  const hint = (opts.hint ?? '').trim();
  const { difficulty } = opts;

  const categories = await knownCategories();

  // anti-doublon : les 20 dernières questions connues
  const { data: recent } = await supabaseAdmin
    .from('battle_questions')
    .select('question')
    .order('created_at', { ascending: false })
    .limit(20);
  const existingTexts = (recent ?? []).map((r) => r.question as string);
  const avoidString = existingTexts.length > 0
    ? `\n\nIMPORTANT: NE PAS générer des questions similaires à celles-ci:\n- ${existingTexts.slice(0, 5).join('\n- ')}`
    : '';

  // 'random' : un tirage de catégorie par question, mais UN SEUL appel OpenAI
  // (le legacy faisait N appels de 1 question : coût et latence x N)
  const themes = category === 'random'
    ? Array.from({ length: count }, () => pickRandom(categories))
    : Array.from({ length: count }, () => category);
  const themeInstruction = category === 'random'
    ? `Une question par sous-thème, dans cet ordre exact: ${themes.join(', ')}.`
    : `Toutes les questions portent sur le sous-thème '${category}'.`;

  const periods = ['années 2020', 'années 2010', 'années 2000', 'années 90', 'années 80', 'de tous les temps', 'récents', 'classiques', 'cultes', 'modernes'];
  const randomPeriod = pickRandom(periods);
  const randomSeed = Math.floor(Math.random() * 1000);

  const hintString = hint
    ? `\n\n⭐ INDICATION SPÉCIALE: Les questions doivent porter sur: "${hint}". Consigne PRIORITAIRE.`
    : '';

  const difficultyInstructions = difficulty === 'Difficile'
    ? `Questions pour CONNAISSEURS et EXPERTS. Détails techniques, anecdotes peu connues, références obscures. Les réponses doivent être proches et difficiles à différencier.`
    : `Questions ACCESSIBLES et GRAND PUBLIC que la plupart des gens peuvent connaître. Privilégie les œuvres/personnages/événements populaires.`;

  const systemPrompt = `Tu es un expert en création de quiz divertissants pour un bar gaming, ciblant un PUBLIC de 20-40 ANS. Génère ${count} question(s) de niveau ${difficulty}. ${themeInstruction}

CONSIGNES:
- ${difficultyInstructions}
- Mélange différentes époques, en particulier les ${randomPeriod}
- Réponses: MAX 40 caractères, ajouter ' (OK)' sur la bonne (EXACTEMENT une par question)
- Chaque réponse doit être UNIQUE et différente des autres
- Seed aléatoire pour variété: ${randomSeed}

TON ET STYLE:
- Ajoute du FUN et de l'ORIGINALITÉ dans la formulation
- Intègre des références pop culture, memes, ou jeux de mots quand approprié
- Évite le ton encyclopédique et scolaire
- Les anecdotes doivent être SURPRENANTES et ENGAGEANTES
${avoidString}${hintString}

Format JSON STRICT (GUILLEMETS DOUBLES obligatoires):
[{
  "question": "...",
  "difficulty": "${difficulty}",
  "theme": "...",
  "answers": ["Réponse 1", "Réponse 2 (OK)", "Réponse 3", "Réponse 4"],
  "help_story": "Anecdote surprenante"
}]

Retourne UNIQUEMENT le JSON, sans markdown ni commentaire.`;

  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0.9,
      max_tokens: 3000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Génère des questions créatives et variées, en évitant les sujets trop rebattus.' },
      ],
    }),
  });

  if (!openaiRes.ok) {
    const errBody = await openaiRes.text().catch(() => '');
    console.error(`[battleGen] OpenAI HTTP ${openaiRes.status}: ${errBody.slice(0, 300)}`);
    return 0;
  }

  const openaiData = (await openaiRes.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = openaiData.choices?.[0]?.message?.content ?? '';
  const cleaned = content.replace(/```json\s*/g, '').replace(/```/g, '').trim();

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const repaired = cleaned.replace(/(?<!\\)'([^']*?)(?<!\\)'(?=\s*[:,\]\}])/g, '"$1"');
    try { parsed = JSON.parse(repaired); } catch { /* invalide, jeté */ }
  }
  if (!Array.isArray(parsed)) return 0;

  const rows: Array<Record<string, unknown>> = [];
  parsed.forEach((raw: RawGenerated, i) => {
    const clean = sanitizeGenerated(raw, themes[i] ?? themes[0] ?? 'Culture Générale');
    if (!clean) return;
    rows.push({
      question: clean.question,
      answers: clean.answers,
      correct_answer_index: clean.correctIndex,
      difficulty,
      theme: clean.theme,
      help_story: clean.helpStory,
    });
  });
  if (rows.length === 0) return 0;

  const { error, data } = await supabaseAdmin
    .from('battle_questions')
    .insert(rows)
    .select('id');
  if (error) {
    console.error('[battleGen] insert error:', error.message);
    return 0;
  }
  return data?.length ?? 0;
}

// ---------------------------------------------------------------------------
// Maintien du stock (appelé par le moteur battle)
// ---------------------------------------------------------------------------

let stockJobRunning = false;

/**
 * Regénère des questions pour chaque difficulté dont le pool DISPONIBLE
 * (used_at IS NULL) est sous le seuil. Ne tourne jamais en double.
 */
export async function ensureQuestionStock(minPerDifficulty = 5): Promise<void> {
  if (stockJobRunning) return;
  stockJobRunning = true;
  try {
    for (const difficulty of BATTLE_DIFFICULTIES) {
      const { count } = await supabaseAdmin
        .from('battle_questions')
        .select('id', { count: 'exact', head: true })
        .eq('difficulty', difficulty)
        .is('used_at', null);
      const available = count ?? 0;
      if (available >= minPerDifficulty) continue;
      const need = Math.min(10, Math.max(5, minPerDifficulty - available));
      console.log(`[battleGen] stock ${difficulty} bas (${available}), génération de ${need}...`);
      const inserted = await generateBattleQuestions({ difficulty, count: need, category: 'random' });
      console.log(`[battleGen] ${inserted} question(s) ${difficulty} ajoutée(s)`);
    }
  } catch (err) {
    console.error('[battleGen] ensureQuestionStock error:', err);
  } finally {
    stockJobRunning = false;
  }
}
