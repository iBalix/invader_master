/**
 * Pastilles « tournoi » des dalles d'échecs : dans les modales de pseudo (qui
 * affronter, avec quelle couleur, cette partie comptera-t-elle ?), sur les
 * panneaux de joueur en partie, et dans le récap de fin (résultat transmis).
 *
 * Tailles des dalles (vues de biais, à un mètre) : 18 px minimum.
 */

import { Trophy } from 'lucide-react';
import { useT } from '../../../i18n/useT';
import { fmtHalf, type ChessTournamentContext, type TournamentLookup } from '../lib/tournamentLookup';
import type { ChessPublicState } from '../lib/chessTypes';

function fill(text: string, vars: Record<string, string | number | null | undefined>): string {
  return Object.entries(vars).reduce((acc, [k, v]) => acc.split(`#${k}#`).join(String(v ?? '')), text);
}

/** consigne principale d'un joueur du tournoi, d'après le lookup */
function instruction(lookup: TournamentLookup, t: ReturnType<typeof useT>): string {
  const opp = lookup.match?.opponent ?? '';
  switch (lookup.hint) {
    case 'play':
      if (lookup.match?.color === 'w') return `${fill(t('table.chess.tournament.vs'), { opponent: opp })} · ${t('table.chess.tournament.youWhite')}`;
      if (lookup.match?.color === 'b') return `${fill(t('table.chess.tournament.vs'), { opponent: opp })} · ${fill(t('table.chess.tournament.youBlack'), { opponent: opp })}`;
      return fill(t('table.chess.tournament.vs'), { opponent: opp });
    case 'playing':
      return t('table.chess.tournament.playing');
    case 'bonus':
      return fill(t('table.chess.tournament.bonus'), { opponent: opp });
    case 'wait_bye':
      return t('table.chess.tournament.waitBye');
    case 'done':
      return t('table.chess.tournament.done');
    case 'next_round':
      return t('table.chess.tournament.nextRound');
    case 'round_done':
      return t('table.chess.tournament.roundDone');
    case 'left':
      return t('table.chess.tournament.left');
    case 'final':
      return t('table.chess.tournament.final');
    default:
      return t('table.chess.tournament.registration');
  }
}

export function TournamentPseudoHint({
  lookup,
  onUsePseudo,
  className = '',
}: {
  lookup: TournamentLookup;
  /** propose le pseudo exact du tournoi quand la casse ou les accents diffèrent */
  onUsePseudo?: (pseudo: string) => void;
  className?: string;
}) {
  const t = useT();
  const active = lookup.hint === 'play' || lookup.hint === 'playing' || lookup.hint === 'bonus';
  const check = lookup.opponentCheck;
  const warn = check !== null && !check.counts;
  const tone = warn
    ? 'border-amber-300/60 bg-amber-400/15 text-amber-100'
    : active
      ? 'border-emerald-300/60 bg-emerald-400/15 text-emerald-100'
      : 'border-table-cyan/50 bg-table-cyan/10 text-table-ink';
  return (
    <div className={`flex items-center gap-3 rounded-2xl border px-4 py-2 ${tone} ${className}`}>
      <Trophy className="h-7 w-7 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-[15px] uppercase tracking-[0.2em] opacity-80">
          {lookup.tournament.title}
          {lookup.tournament.round ? ` · ${fill(t('table.chess.tournament.round'), { round: lookup.tournament.round })}` : ''}
        </div>
        <div className="text-[18px] font-semibold leading-snug">
          {check
            ? check.counts
              ? t('table.chess.tournament.counts')
              : check.expected
                ? fill(t('table.chess.tournament.notCounted'), { opponent: check.pseudo, expected: check.expected })
                : t('table.chess.tournament.notCountedNoOpp')
            : instruction(lookup, t)}
        </div>
      </div>
      {!lookup.player.exact && onUsePseudo && (
        <button
          type="button"
          onClick={() => onUsePseudo(lookup.player.pseudo)}
          className="shrink-0 rounded-xl border border-white/25 bg-white/10 px-3 py-2 font-display text-[15px] uppercase tracking-wider active:scale-95"
        >
          {fill(t('table.chess.tournament.usePseudo'), { pseudo: lookup.player.pseudo })}
        </button>
      )}
    </div>
  );
}

/** pastille sur les panneaux de joueur pendant une partie de tournoi */
export function TournamentGameBadge({ ctx }: { ctx: ChessTournamentContext }) {
  const t = useT();
  if (!ctx.match || (!ctx.pending && !ctx.counted)) return null;
  const label =
    ctx.match.kind === 'floater'
      ? t('table.chess.tournament.bonusGame')
      : fill(t('table.chess.tournament.game'), { round: ctx.tournament.round ?? '', board: ctx.match.board });
  return (
    <div className="flex items-center gap-2 rounded-full border border-amber-300/50 bg-amber-400/15 px-3 py-1.5 font-display text-[15px] uppercase tracking-wider text-amber-100">
      <Trophy className="h-5 w-5 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );
}

/** ligne du récap de fin : résultat transmis, points, partie suivante */
export function TournamentResultLine({
  ctx,
  state,
}: {
  ctx: ChessTournamentContext | null;
  state: Pick<ChessPublicState, 'seats' | 'result'>;
}) {
  const t = useT();
  if (!ctx || !ctx.match) return null;
  const real = state.result && !['cancelled', 'lobby_expired', 'terminated', 'inactivity'].includes(state.result.reason);
  if (!real) return null;
  let text: string;
  let tone = 'border-amber-300/50 bg-amber-400/10 text-amber-100';
  if (ctx.counted && ctx.match.decided && ctx.match.points) {
    const w = state.seats.w?.pseudo ?? 'Blancs';
    const b = state.seats.b?.pseudo ?? 'Noirs';
    const parts = [
      fill(t('table.chess.tournament.points'), { points: fmtHalf(ctx.match.points.w), pseudo: w }),
      ...(ctx.match.kind === 'floater' ? [] : [fill(t('table.chess.tournament.points'), { points: fmtHalf(ctx.match.points.b), pseudo: b })]),
    ];
    text = `${t('table.chess.tournament.reported')} · ${parts.join(' · ')}`;
    tone = 'border-emerald-300/50 bg-emerald-400/10 text-emerald-100';
  } else if (ctx.counted) {
    text = fill(t('table.chess.tournament.nextGame'), {
      score: `${fmtHalf(ctx.match.score.w)}-${fmtHalf(ctx.match.score.b)}`,
    });
  } else if (ctx.pending) {
    text = t('table.chess.tournament.pendingReport');
  } else {
    text = t('table.chess.tournament.ignored');
    tone = 'border-white/15 bg-white/5 text-table-ink-soft';
  }
  return (
    <div className={`flex w-full items-center justify-center gap-3 rounded-2xl border px-5 py-3 ${tone}`}>
      <Trophy className="h-6 w-6 shrink-0" />
      <span className="text-center text-[18px] font-semibold">{text}</span>
    </div>
  );
}

/** carte du lobby : le créateur attend son adversaire de tournoi */
export function LobbyTournamentChip({ opponent }: { opponent: string }) {
  const t = useT();
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2.5 py-0.5 font-display uppercase tracking-wider text-amber-200">
      <Trophy className="h-4 w-4" />
      {fill(t('table.chess.tournament.lobbyWaiting'), { opponent })}
    </span>
  );
}
