/**
 * Lancement de jeux sur les tables tactiles.
 *
 * PRINCIPE : l'ordre de lancement persisté est la source de vérité, pas
 * l'événement temps réel. Les deux dalles de la table lisent le même ordre :
 * celle qui a cliqué et l'autre voient donc toujours la même chose, et un
 * écran qui rate un événement se rattrape au sondage suivant.
 *
 * C'est ce qui règle les pannes constatées :
 *   - un client sur l'écran secondaire peut enfin lancer un jeu (le backend
 *     adresse l'ordre au master, seul PC câblé aux deux dalles) ;
 *   - l'écran secondaire ne reste plus bloqué sur « partie en cours » ;
 *   - le temps réel devient optionnel : il accélère, il ne conditionne rien.
 *
 * CE QUE CE MODULE NE FAIT PAS, VOLONTAIREMENT : vérifier que l'émulateur a
 * réellement démarré. Le client le voit de ses yeux, et le lancement par
 * deeplink n'a jamais posé problème au bar. Un ordre qu'aucun écran ne réclame
 * finit en échec au bout de quelques secondes, c'est la seule erreur possible.
 */

import { supabaseAdmin } from '../config/supabase.js';
import { broadcastTopic } from '../games/realtime.js';

/**
 * pending    : créé, le master ne l'a pas encore réclamé
 * dispatched : le master a tiré le deeplink, la partie est considérée en cours
 * failed     : personne ne l'a réclamé (écran principal fermé ou figé)
 * cancelled  : arrêté à la main, ou remplacé par une autre demande
 */
export type LaunchStatus = 'pending' | 'dispatched' | 'failed' | 'cancelled';

export interface LaunchOrder {
  id: string;
  target_hostname: string;
  requested_by: string;
  game_id: string | null;
  game_name: string;
  launch_url: string;
  status: LaunchStatus;
  created_at: string;
  ack_deadline_at: string | null;
  dispatched_at: string | null;
  ended_at: string | null;
  ended_by: string | null;
}

const TABLE = 'table_launch_orders';

/** délai laissé au master pour réclamer l'ordre avant de déclarer l'échec */
const ACK_GRACE_MS = 10_000;
/** l'échec reste lisible quelques secondes après coup (voir getDisplayOrderFor) */
const FAILURE_GRACE_MS = 20_000;
/** filet final : aucune partie ne reste ouverte plus longtemps */
const MAX_ORDER_AGE_MS = 4 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Hostnames
// ---------------------------------------------------------------------------

const HOSTNAME_RE = /^TABLE(\d{2})-([12])$/;

export function parseTableHostname(
  hostname: string,
): { hostname: string; tableId: string; role: 'master' | 'slave' } | null {
  const clean = (hostname ?? '').trim().toUpperCase();
  const m = HOSTNAME_RE.exec(clean);
  if (!m) return null;
  return { hostname: clean, tableId: `TABLE${m[1]}`, role: m[2] === '1' ? 'master' : 'slave' };
}

/**
 * Le PC qui lance est TOUJOURS le master : lui seul est câblé aux deux dalles
 * et sait basculer l'écran du slave (via InvaderLauncher et le flag istable=1).
 */
export function masterOf(hostname: string): string | null {
  const p = parseTableHostname(hostname);
  return p ? `${p.tableId}-1` : null;
}

export function tableIdOf(hostname: string): string | null {
  return parseTableHostname(hostname)?.tableId ?? null;
}

// ---------------------------------------------------------------------------
// Deeplink
// ---------------------------------------------------------------------------

/**
 * Construit le lien `invader:\\run?...` que le lanceur Windows resout.
 *
 * LA BARRE OBLIQUE DOIT RESTER BRUTE, c'est tout l'enjeu de cette fonction.
 *
 * La version precedente passait par URLSearchParams, qui encode `/` en `%2F`.
 * Le lanceur ne decode pas : il cherchait donc un fichier litteralement nomme
 * `Tekken3%2FTekken3.cue`, ne le trouvait pas, et RetroArch se refermait
 * aussitot. La borne semblait lancer le jeu puis revenait a l'interface. Les
 * jeux ranges a plat marchaient, ceux ranges dans un sous-dossier non : 5 sur
 * 32 au catalogue, tous les PlayStation en .cue.
 *
 * La reference est le comportement de l'ancienne interface : `game.php` injecte
 * le nom de fichier BRUT dans un href, et son JS relit `link.href`, donc l'URL
 * telle que le navigateur l'a normalisee. Cette normalisation laisse `/` en
 * clair et encode l'espace en `%20`. C'est exactement ce que reproduit la ligne
 * ci-dessous : encodeURIComponent pour tout le reste, puis on rend sa barre
 * oblique au chemin.
 *
 * Le commentaire precedent invoquait un `buildInvaderUrl` cote front et une
 * histoire d'espaces devenant `+`. Cette fonction n'existe nulle part dans le
 * legacy, et aucun nom de fichier du catalogue ne contient d'espace : la
 * justification etait fausse, et c'est elle qui a fait garder l'encodage fautif.
 *
 * Construire ce lien cote serveur ferme par ailleurs un trou : l'endpoint est
 * public, et un client ne doit pas pouvoir faire executer une commande
 * arbitraire sur un PC du bar.
 */
export function buildDeeplink(fileName: string, library: string): string {
  const jeu = encodeURIComponent(fileName).replace(/%2F/gi, '/');
  return `invader:\\\\run?run=1&istable=1&cmd=retroarch&libcore=${library}.dll&game=${jeu}`;
}

async function resolveGame(
  gameId: string,
): Promise<{ id: string; name: string; deeplink: string } | null> {
  const { data: game } = await supabaseAdmin
    .from('games_v2')
    .select('id, name, file_name, console_id')
    .eq('id', gameId)
    .maybeSingle();
  if (!game?.file_name || !game.console_id) return null;

  const { data: consoleRow } = await supabaseAdmin
    .from('game_consoles_v2')
    .select('library')
    .eq('id', game.console_id)
    .maybeSingle();
  const library = consoleRow?.library as string | undefined;
  if (!library) return null;

  return {
    id: game.id as string,
    name: (game.name as string) ?? '',
    deeplink: buildDeeplink(game.file_name as string, library),
  };
}

// ---------------------------------------------------------------------------
// Accès aux ordres
// ---------------------------------------------------------------------------

export async function getOrder(id: string): Promise<LaunchOrder | null> {
  const { data } = await supabaseAdmin.from(TABLE).select('*').eq('id', id).maybeSingle();
  return (data as LaunchOrder) ?? null;
}

/** l'ordre vivant d'une table : le seul que les deux dalles affichent */
export async function getLiveOrderFor(hostname: string): Promise<LaunchOrder | null> {
  const target = masterOf(hostname);
  if (!target) return null;
  const { data } = await supabaseAdmin
    .from(TABLE)
    .select('*')
    .eq('target_hostname', target)
    .is('ended_at', null)
    .limit(1);
  return (data?.[0] as LaunchOrder) ?? null;
}

/**
 * Ce que les dalles doivent afficher. Un échec ferme l'ordre (sinon l'index
 * unique empêcherait toute nouvelle tentative), donc il disparaîtrait aussitôt
 * de l'ordre vivant : on le laisse visible quelques secondes pour que le
 * client ait le temps de lire le message au lieu de revenir à l'accueil sans
 * explication.
 */
export async function getDisplayOrderFor(hostname: string): Promise<LaunchOrder | null> {
  const live = await getLiveOrderFor(hostname);
  if (live) return live;

  const target = masterOf(hostname);
  if (!target) return null;
  const { data } = await supabaseAdmin
    .from(TABLE)
    .select('*')
    .eq('target_hostname', target)
    .eq('status', 'failed')
    .gte('ended_at', new Date(Date.now() - FAILURE_GRACE_MS).toISOString())
    .order('ended_at', { ascending: false })
    .limit(1);
  return (data?.[0] as LaunchOrder) ?? null;
}

async function patch(id: string, fields: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin.from(TABLE).update(fields).eq('id', id);
  if (error) console.error('[launch] update failed', error.message);
}

/** coup de coude aux deux dalles : « relis ton ordre ». Aucune donnée métier. */
function nudge(targetHostname: string): void {
  const tableId = tableIdOf(targetHostname);
  if (tableId) void broadcastTopic(`table:${tableId}`, 'launch-update');
}

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

export interface CreateResult {
  order: LaunchOrder;
  /** un ordre était déjà en cours sur cette table */
  alreadyActive: boolean;
}

export async function createOrder(
  requestedBy: string,
  gameId: string,
  opts: { replace?: boolean } = {},
): Promise<CreateResult> {
  const parsed = parseTableHostname(requestedBy);
  if (!parsed) throw httpError(400, 'Hostname de table invalide');

  const target = `${parsed.tableId}-1`;
  const game = await resolveGame(gameId);
  if (!game) throw httpError(400, "Ce jeu n'est pas configuré pour être lancé");

  const live = await getLiveOrderFor(target);
  if (live) {
    // Double clic, ou clic simultané sur les deux dalles : une seule partie.
    if (live.game_id === gameId) return { order: live, alreadyActive: true };
    // Jeu différent : jamais de bascule silencieuse, le client doit confirmer.
    if (!opts.replace) return { order: live, alreadyActive: true };
    await finishOrder(live.id, 'cancelled', 'superseded');
  }

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert({
      target_hostname: target,
      requested_by: parsed.hostname,
      game_id: game.id,
      game_name: game.name,
      launch_url: game.deeplink,
      status: 'pending',
      ack_deadline_at: new Date(Date.now() + ACK_GRACE_MS).toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    // 23505 = l'index unique partiel a gagné la course contre un autre POST.
    // Deux clics simultanés ne peuvent donc pas produire deux lancements.
    if ((error as { code?: string }).code === '23505') {
      const existing = await getLiveOrderFor(target);
      if (existing) return { order: existing, alreadyActive: true };
    }
    throw error;
  }

  const order = data as LaunchOrder;
  nudge(target);
  console.log(`[launch] ordre ${short(order.id)} créé : ${order.game_name} -> ${target}`);
  return { order, alreadyActive: false };
}

// ---------------------------------------------------------------------------
// Exécution par le navigateur du master
// ---------------------------------------------------------------------------

export interface AckResult {
  ok: boolean;
  order: LaunchOrder;
  /** présent seulement si ok : c'est le seul endroit d'où le client l'obtient */
  deeplink?: string;
}

/**
 * Le master réclame l'exécution. Compare-and-set sur `status` : si l'ordre a
 * déjà été réclamé (autre onglet, double appel), l'ACK échoue et le navigateur
 * NE tire PAS le deeplink. Le jeu ne peut donc pas démarrer deux fois.
 */
export async function ackOrder(id: string, hostname: string): Promise<AckResult> {
  const order = await getOrder(id);
  if (!order) throw httpError(404, 'Ordre introuvable');
  if (order.target_hostname !== (hostname ?? '').trim().toUpperCase()) {
    throw httpError(403, "Seul l'écran principal de la table exécute les lancements");
  }
  if (order.ended_at || order.status !== 'pending') return { ok: false, order };

  const { data } = await supabaseAdmin
    .from(TABLE)
    .update({ status: 'dispatched', dispatched_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending') // <- la garde
    .select('*');

  const updated = (data?.[0] as LaunchOrder) ?? null;
  if (!updated) return { ok: false, order: (await getOrder(id)) ?? order };

  nudge(order.target_hostname);
  return { ok: true, order: updated, deeplink: updated.launch_url };
}

/**
 * Chrome reprend le focus sur le master : le jeu vient de se fermer.
 * C'est le signal de fin de partie, déjà utilisé par l'ancien code. Il libère
 * les DEUX dalles, alors qu'avant il ne nettoyait que le master.
 */
export async function reportFocus(id: string): Promise<LaunchOrder | null> {
  const order = await getOrder(id);
  if (!order || order.ended_at) return order;
  await finishOrder(id, order.status === 'dispatched' ? 'dispatched' : 'cancelled', 'master-focus');
  return getOrder(id);
}

// ---------------------------------------------------------------------------
// Fin de vie
// ---------------------------------------------------------------------------

async function finishOrder(id: string, status: LaunchStatus, by: string): Promise<void> {
  const order = await getOrder(id);
  if (!order || order.ended_at) return;
  await patch(id, { status, ended_at: new Date().toISOString(), ended_by: by });
  nudge(order.target_hostname);
  console.log(`[launch] ordre ${short(id)} terminé (${status}/${by})`);
}

/** Bouton « Terminer », disponible sur les deux dalles. */
export async function endOrder(id: string, by = 'user'): Promise<void> {
  const order = await getOrder(id);
  if (!order) return;
  await finishOrder(id, order.status === 'dispatched' ? 'dispatched' : 'cancelled', by);
}

// ---------------------------------------------------------------------------
// Ordonnanceur
// ---------------------------------------------------------------------------

let ticking = false;

/**
 * Deux tâches seulement : déclarer en échec un ordre que le master n'a jamais
 * réclamé, et refermer les ordres oubliés.
 *
 * Les échéances sont lues en base, jamais gardées dans des setTimeout : un
 * redéploiement Railway en pleine soirée ne perd donc aucune transition.
 */
export async function tickLaunchOrders(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const { data } = await supabaseAdmin.from(TABLE).select('*').is('ended_at', null);
    const now = Date.now();

    for (const order of (data ?? []) as LaunchOrder[]) {
      if (now - new Date(order.created_at).getTime() > MAX_ORDER_AGE_MS) {
        await finishOrder(order.id, order.status, 'sweeper');
        continue;
      }
      if (order.status === 'pending' && due(order.ack_deadline_at, now)) {
        // L'écran principal n'a pas répondu : Chrome fermé, figé, ou hostname
        // mal configuré. Le client voit un message clair au lieu d'un spinner
        // qui tourne indéfiniment.
        await finishOrder(order.id, 'failed', 'no-master');
      }
    }
  } catch (err) {
    console.error('[launch] tick', err);
  } finally {
    ticking = false;
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startLaunchScheduler(): void {
  if (timer) return;
  timer = setInterval(() => void tickLaunchOrders(), 3000);
  console.log('[launch] ordonnanceur démarré');
}

// ---------------------------------------------------------------------------

function due(iso: string | null, now: number): boolean {
  return !!iso && new Date(iso).getTime() <= now;
}

function short(id: string): string {
  return id.slice(0, 8);
}

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { httpStatus: status });
}

/** état affiché aux dalles : rien de plus que ce qu'elles ont à savoir */
export function toPublicOrder(order: LaunchOrder | null) {
  if (!order) return null;
  return {
    id: order.id,
    status: order.status,
    gameId: order.game_id,
    gameName: order.game_name,
    requestedBy: order.requested_by,
    targetHostname: order.target_hostname,
    createdAt: order.created_at,
    endedAt: order.ended_at,
  };
}
