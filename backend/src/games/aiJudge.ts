/**
 * Juge des réponses libres.
 *
 * 1. Pré-filtre local gratuit : normalisation + distance d'édition
 *    (tranche les cas évidents : exact, faute légère, équivalence numérique).
 * 2. Les cas ambigus partent en UN SEUL appel OpenAI batch (tolère fautes,
 *    abréviations, reformulations). Sans clé API : refus par défaut,
 *    le GM tranche depuis sa console avant la révélation.
 */

import type { FreeTextVerdict } from './types.js';

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accents
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

function localVerdict(given: string, expected: string): FreeTextVerdict | null {
  const g = normalize(given);
  const e = normalize(expected);
  if (!g) return { accepted: false, source: 'none' };
  if (g === e) return { accepted: true, source: 'exact' };
  // Faute légère : distance proportionnelle à la longueur
  const tolerance = Math.max(1, Math.floor(e.length / 6));
  if (levenshtein(g, e) <= tolerance) return { accepted: true, source: 'fuzzy' };
  // "victor hugo" vs "hugo" : le nom attendu contenu dans la réponse (ou l'inverse
  // pour les réponses multi-mots dont un mot significatif suffit rarement) :
  // seulement réponse donnée qui contient la réponse attendue complète.
  if (e.length >= 4 && g.includes(e)) return { accepted: true, source: 'fuzzy' };
  return null; // ambigu
}

export async function judgeFreeText(
  question: string,
  expected: string,
  entries: Array<{ playerId: string; text: string }>,
): Promise<Record<string, FreeTextVerdict>> {
  const verdicts: Record<string, FreeTextVerdict> = {};
  const ambiguous: Array<{ playerId: string; text: string }> = [];

  for (const entry of entries) {
    const local = localVerdict(entry.text, expected);
    if (local) verdicts[entry.playerId] = local;
    else ambiguous.push(entry);
  }

  if (ambiguous.length > 0) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      for (const e of ambiguous) verdicts[e.playerId] = { accepted: false, source: 'none' };
      return verdicts;
    }
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                "Tu juges des réponses de quiz de bar. Accepte une réponse si elle désigne la même chose que la réponse attendue, en tolérant fautes d'orthographe, abréviations, articles manquants, prénom omis, ou formulation différente. Refuse si c'est une autre réponse ou trop vague. Réponds en JSON: {\"verdicts\": [{\"i\": <index>, \"ok\": <bool>}]}",
            },
            {
              role: 'user',
              content: JSON.stringify({
                question,
                reponse_attendue: expected,
                reponses: ambiguous.map((e, i) => ({ i, texte: e.text })),
              }),
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}`);
      const data = (await res.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      const parsed = JSON.parse(data.choices[0]?.message?.content ?? '{}') as {
        verdicts?: Array<{ i: number; ok: boolean }>;
      };
      const byIndex = new Map((parsed.verdicts ?? []).map((v) => [v.i, v.ok]));
      ambiguous.forEach((e, i) => {
        verdicts[e.playerId] = { accepted: Boolean(byIndex.get(i)), source: 'ai' };
      });
    } catch (err) {
      console.error('[aiJudge] OpenAI error, verdicts par défaut refusés', err);
      for (const e of ambiguous) verdicts[e.playerId] = { accepted: false, source: 'none' };
    }
  }

  return verdicts;
}
