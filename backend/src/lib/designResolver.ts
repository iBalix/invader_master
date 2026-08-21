/**
 * Resout la config design "effective" parmi les configs actives.
 *
 * Priorite : une config dont la planification matche l'instant present
 * (plage de dates OU plage recurrente) l'emporte sur une config 'always'.
 * Entre plusieurs candidates de meme niveau, la plus recemment modifiee gagne.
 * Hors plage, on retombe sur la config 'always'.
 */

import { supabaseAdmin } from '../config/supabase.js';

interface DesignConfigRow {
  id: string;
  name: string;
  background_image_url: string | null;
  menu_button_color: string;
  games_button_color: string;
  active: boolean;
  schedule_type: 'always' | 'date_range' | 'recurring';
  starts_at: string | null;
  ends_at: string | null;
  recurring_days: string[] | null;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
  updated_at: string;
}

function parseTimeToMinutes(value: string | null): number | null {
  if (!value) return null;
  const [h, m] = value.split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function parisNow(): { day: string; minutes: number } {
  const now = new Date();
  const opts = { timeZone: 'Europe/Paris' } as const;
  const day = now.toLocaleString('en-US', { ...opts, weekday: 'short' }).toLowerCase().slice(0, 3);
  const hour = Number(now.toLocaleString('en-US', { ...opts, hour: 'numeric', hour12: false }));
  const minute = Number(now.toLocaleString('en-US', { ...opts, minute: 'numeric' }));
  return { day, minutes: hour * 60 + minute };
}

type Level = 'ranged' | 'always' | null;

function matchLevel(cfg: DesignConfigRow, now: Date, paris: { day: string; minutes: number }): Level {
  if (cfg.schedule_type === 'always') return 'always';
  if (cfg.schedule_type === 'date_range') {
    const s = cfg.starts_at ? new Date(cfg.starts_at) : null;
    const e = cfg.ends_at ? new Date(cfg.ends_at) : null;
    if (s && now < s) return null;
    if (e && now > e) return null;
    return 'ranged';
  }
  if (cfg.schedule_type === 'recurring') {
    const days = cfg.recurring_days ?? [];
    if (!days.includes(paris.day)) return null;
    const st = parseTimeToMinutes(cfg.start_time);
    const en = parseTimeToMinutes(cfg.end_time);
    if (st == null || en == null) return null;
    if (paris.minutes < st || paris.minutes >= en) return null;
    return 'ranged';
  }
  return null;
}

// Duree pendant laquelle un choix aleatoire (plusieurs configs a egalite de
// priorite) reste stable, pour ne pas changer a chaque refresh de borne.
const STICKY_WINDOW_MS = 15 * 60 * 1000;

interface RuntimeState {
  current_config_id: string | null;
  chosen_at: string | null;
}

/** numero de table extrait d'un hostname : "TABLE07" -> 7 */
function tableIndexOf(tableNumber: string | null | undefined): number | null {
  const m = /^TABLE(\d{2})$/.exec((tableNumber ?? '').trim().toUpperCase());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n > 0 ? n : null;
}

/** true si le reglage « un design par table » est actif (defaut : oui) */
async function isPerTableMode(): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('tables_settings')
    .select('design_per_table')
    .limit(1)
    .maybeSingle();
  // Absence de ligne ou colonne : on retombe sur le comportement voulu par
  // defaut plutot que sur l'aleatoire.
  return (data as { design_per_table?: boolean } | null)?.design_per_table !== false;
}

export interface ResolvedDesign {
  /** le design a appliquer sur cette borne */
  design: DesignConfigRow | null;
  /**
   * Le groupe de designs eligibles au meme instant. C'est dans cette liste, et
   * pas dans tous les designs actifs, que la pastille de l'accueil fait
   * tourner le fond : ainsi un design planifie pour une soiree speciale reste
   * respecte, le client ne peut pas revenir a un fond hors saison.
   */
  group: DesignConfigRow[];
}

/**
 * @param tableNumber "TABLE07" (prefixe compris). Quand il est fourni ET que le
 * mode « un design par table » est actif, l'attribution devient DETERMINISTE :
 * la table N recoit le Nieme design du groupe. Comme TABLExx-1 et TABLExx-2
 * donnent le meme numero, les deux dalles d'une table partagent leur fond sans
 * aucun etat partage a maintenir.
 */
export async function resolveEffectiveDesign(tableNumber?: string | null): Promise<ResolvedDesign> {
  const { data } = await supabaseAdmin.from('design_configs').select('*').eq('active', true);
  const configs = (data ?? []) as DesignConfigRow[];
  if (configs.length === 0) return { design: null, group: [] };

  const now = new Date();
  const paris = parisNow();

  const ranged: DesignConfigRow[] = [];
  const always: DesignConfigRow[] = [];
  for (const cfg of configs) {
    const lvl = matchLevel(cfg, now, paris);
    if (lvl === 'ranged') ranged.push(cfg);
    else if (lvl === 'always') always.push(cfg);
  }

  const byUpdated = (a: DesignConfigRow, b: DesignConfigRow) =>
    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  ranged.sort(byUpdated);
  always.sort(byUpdated);

  // Groupe gagnant : les configs planifiees (plage horaire/date) priment
  // toujours sur les configs 'always'. On applique la stickiness a l'interieur
  // de ce groupe uniquement.
  const topGroup = ranged.length > 0 ? ranged : always;
  if (topGroup.length === 0) return { design: null, group: [] };

  // Ordre d'attribution : celui affiche dans le back-office (created_at), pour
  // que la regle reste lisible par le staff. `id` departage les ex aequo.
  const ordered = [...topGroup].sort((a, b) => {
    const d = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });

  if (topGroup.length === 1) {
    await persistPick(topGroup[0].id, now, /*resetTimer*/ false);
    return { design: topGroup[0], group: ordered };
  }

  // Mode « un design par table » : deterministe, donc aucune ecriture en base
  // et aucune derive au fil des sondages de 60 s des bornes.
  const index = tableIndexOf(tableNumber);
  if (index !== null && (await isPerTableMode())) {
    return { design: ordered[(index - 1) % ordered.length], group: ordered };
  }

  // Plusieurs configs a egalite : on garde le choix courant s'il est encore
  // dans le groupe gagnant ET dans la fenetre de 15 min. Sinon on re-tire.
  const { data: stateData } = await supabaseAdmin
    .from('design_runtime_state')
    .select('current_config_id, chosen_at')
    .eq('id', true)
    .maybeSingle();
  const state = (stateData ?? null) as RuntimeState | null;

  if (state?.current_config_id && state.chosen_at) {
    const current = topGroup.find((c) => c.id === state.current_config_id);
    const ageMs = now.getTime() - new Date(state.chosen_at).getTime();
    if (current && ageMs < STICKY_WINDOW_MS) {
      return { design: current, group: ordered };
    }
  }

  const pick = topGroup[Math.floor(Math.random() * topGroup.length)];
  await persistPick(pick.id, now, /*resetTimer*/ true);
  return { design: pick, group: ordered };
}

/**
 * Memorise le choix courant. `resetTimer` relance la fenetre de 15 min :
 *   - true  : nouveau tirage (ou prise de relais) -> chosen_at = now
 *   - false : config unique -> on ne touche chosen_at que si l'id change
 */
async function persistPick(configId: string, now: Date, resetTimer: boolean): Promise<void> {
  if (!resetTimer) {
    const { data } = await supabaseAdmin
      .from('design_runtime_state')
      .select('current_config_id')
      .eq('id', true)
      .maybeSingle();
    if ((data as RuntimeState | null)?.current_config_id === configId) return;
  }
  await supabaseAdmin
    .from('design_runtime_state')
    .upsert({ id: true, current_config_id: configId, chosen_at: now.toISOString() });
}
