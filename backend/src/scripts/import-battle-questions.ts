/**
 * Import one-shot des questions battle depuis MySQL OVH (legacy) vers Postgres.
 *
 * - parse le marqueur " (OK)" du legacy vers correct_answer_index
 *   (détection sans espace comme le serveur PHP, nettoyage avec puis sans espace)
 * - normalise le thème "Jeux-vidéos" en "Jeux-vidéo"
 * - upsert sur legacy_id : re-runnable sans doublon, used_at préservé
 *
 * Usage : cd backend && npx tsx src/scripts/import-battle-questions.ts
 */

import '../config/env.js';
import { getMysqlPool } from '../config/mysql.js';
import { supabaseAdmin } from '../config/supabase.js';

interface MysqlRow {
  id: number;
  question: string;
  difficulty: string;
  theme: string;
  answers: string | string[];
  help_story: string | null;
}

const VALID_DIFFICULTIES = new Set(['Facile', 'Moyen', 'Difficile']);

function cleanTheme(theme: string): string {
  return theme === 'Jeux-vidéos' ? 'Jeux-vidéo' : theme;
}

function parseAnswers(raw: string | string[]): { answers: string[]; correctIndex: number } | null {
  let list: unknown;
  try {
    list = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!Array.isArray(list) || list.length !== 4 || !list.every((a) => typeof a === 'string')) {
    return null;
  }
  const answers = list as string[];
  // détection identique au legacy PHP : strpos($a, "(OK)") sans l'espace
  const correctIndex = answers.findIndex((a) => a.includes('(OK)'));
  if (correctIndex === -1) return null;
  const cleaned = answers.map((a) => a.replace(' (OK)', '').replace('(OK)', '').trim());
  if (cleaned.some((a) => a.length === 0)) return null;
  return { answers: cleaned, correctIndex };
}

async function main(): Promise<void> {
  const pool = getMysqlPool();
  console.log('Lecture des questions battle depuis MySQL...');
  const [rows] = await pool.query(
    'SELECT id, question, difficulty, theme, answers, help_story FROM battle_questions ORDER BY id ASC',
  );
  const mysqlRows = rows as MysqlRow[];
  console.log(`${mysqlRows.length} questions trouvées.`);

  const upserts: Array<Record<string, unknown>> = [];
  const skipped: Array<{ id: number; reason: string }> = [];

  for (const row of mysqlRows) {
    if (!VALID_DIFFICULTIES.has(row.difficulty)) {
      skipped.push({ id: row.id, reason: `difficulté invalide "${row.difficulty}"` });
      continue;
    }
    const parsed = parseAnswers(row.answers);
    if (!parsed) {
      skipped.push({ id: row.id, reason: 'réponses invalides ou marqueur (OK) absent' });
      continue;
    }
    upserts.push({
      legacy_id: row.id,
      question: row.question,
      answers: parsed.answers,
      correct_answer_index: parsed.correctIndex,
      difficulty: row.difficulty,
      theme: cleanTheme(row.theme ?? ''),
      help_story: row.help_story ?? '',
      updated_at: new Date().toISOString(),
    });
  }

  console.log(`${upserts.length} questions à upserter, ${skipped.length} ignorées.`);
  for (const s of skipped) console.warn(`  - skip legacy_id=${s.id} : ${s.reason}`);

  const CHUNK = 200;
  let done = 0;
  for (let i = 0; i < upserts.length; i += CHUNK) {
    const chunk = upserts.slice(i, i + CHUNK);
    const { error } = await supabaseAdmin
      .from('battle_questions')
      .upsert(chunk, { onConflict: 'legacy_id' });
    if (error) {
      console.error(`Erreur upsert (chunk ${i / CHUNK}) :`, error.message);
      process.exit(1);
    }
    done += chunk.length;
    console.log(`  upsert ${done}/${upserts.length}`);
  }

  // bilan par difficulté
  const { data: stats } = await supabaseAdmin
    .from('battle_questions')
    .select('difficulty');
  const counts: Record<string, number> = {};
  for (const r of stats ?? []) counts[r.difficulty] = (counts[r.difficulty] ?? 0) + 1;
  console.log('Bilan Postgres :', counts);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
