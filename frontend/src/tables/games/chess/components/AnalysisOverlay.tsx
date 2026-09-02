/**
 * Analyse de fin de partie : on rejoue la partie coup par coup, avec les
 * moments clés repérés.
 *
 * Le plateau est le MÊME composant que pendant la partie : `ChessBoard` est
 * purement présentationnel, on lui passe des pièces déjà positionnées et pas de
 * sélection. Et comme `trackPieces` donne aux pièces des identités stables,
 * avancer d'un coup anime le déplacement tout seul, sans une ligne d'animation
 * ici. Un saut de plusieurs coups (clic dans la liste) coupe les transitions,
 * sinon toutes les pièces glisseraient en même temps à travers l'échiquier.
 *
 * Le calcul tourne sur la dalle (cf. `lib/chessAnalysis`), par tranches, pour
 * que la barre de progression s'anime et que l'écran reste réactif.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, SkipBack, SkipForward, X } from 'lucide-react';
import ChessBoard from './ChessBoard';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import { buildChess, kingSquare } from '../lib/chessRules';
import { trackPieces } from '../lib/pieceTracker';
import { analyseGame, type AnalysedMove, type GameAnalysis, type MoveVerdict } from '../lib/chessAnalysis';
import type { Orientation } from '../lib/geometry';
import type { ChessColor, ChessPublicState } from '../lib/chessTypes';
import type { ChessTheme } from '../themes/types';
import { useT } from '../../../i18n/useT';

/** largeur du panneau d'analyse, en px (w-[26rem]) */
const PANEL_PX = 416;

interface Props {
  state: ChessPublicState;
  theme: ChessTheme;
  boardSize: number;
  /** orientation du joueur : il revoit la partie de son côté */
  orientation: Orientation;
  reduced: boolean;
  onClose: () => void;
}

const VERDICT_STYLE: Record<MoveVerdict, { color: string; badge: string; icon: string }> = {
  blunder: { color: '#FF4D6D', badge: 'bg-rose-500/20 text-rose-300 border-rose-400/40', icon: '??' },
  mistake: { color: '#FF9F45', badge: 'bg-orange-500/20 text-orange-300 border-orange-400/40', icon: '?' },
  inaccuracy: { color: '#FFD166', badge: 'bg-amber-400/20 text-amber-200 border-amber-300/40', icon: '?!' },
  best: { color: '#4ADE80', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40', icon: '★' },
  good: { color: '#8B93A8', badge: '', icon: '' },
};

export default function AnalysisOverlay({
  state,
  theme,
  boardSize,
  orientation,
  reduced,
  onClose,
}: Props) {
  const t = useT();
  const [analysis, setAnalysis] = useState<GameAnalysis | null>(null);
  const [progress, setProgress] = useState(0);
  const [ply, setPly] = useState(state.moves.length);

  // lancement du calcul ; `annule` évite de poser un état après démontage
  useEffect(() => {
    let annule = false;
    void analyseGame(state.moves, (fait, total) => {
      if (!annule) setProgress(total > 0 ? fait / total : 1);
    }).then((res) => {
      if (!annule) setAnalysis(res);
    });
    return () => {
      annule = true;
    };
  }, [state.moves]);

  // position affichée : les `ply` premiers demi-coups
  const shown = useMemo(() => state.moves.slice(0, ply), [state.moves, ply]);
  const chess = useMemo(() => buildChess(shown), [shown]);
  const tracked = useMemo(() => trackPieces(shown), [shown]);
  const lastUci = shown.length > 0 ? shown[shown.length - 1] : null;
  const lastMove = lastUci ? { from: lastUci.slice(0, 2), to: lastUci.slice(2, 4) } : null;
  const checkSquare = chess.inCheck() ? kingSquare(chess, chess.turn() as ChessColor) : null;

  // saut de plus d'un coup : on coupe les transitions le temps d'une frame
  const prevPly = useRef(ply);
  const [suppress, setSuppress] = useState(true);
  useEffect(() => {
    const saut = Math.abs(ply - prevPly.current) > 1;
    prevPly.current = ply;
    if (!saut && !suppress) return undefined;
    setSuppress(true);
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setSuppress(false)));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ply]);

  const courant: AnalysedMove | null =
    analysis && ply > 0 ? (analysis.moves[ply - 1] ?? null) : null;

  const compte = useMemo(() => {
    const vide = { blunder: 0, mistake: 0, inaccuracy: 0 };
    if (!analysis) return vide;
    for (const m of analysis.moves) {
      if (m.verdict === 'blunder' || m.verdict === 'mistake' || m.verdict === 'inaccuracy') {
        vide[m.verdict] += 1;
      }
    }
    return vide;
  }, [analysis]);

  const boardRef = useRef<HTMLDivElement>(null);
  const listeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listeRef.current
      ?.querySelector<HTMLElement>(`[data-ply="${ply - 1}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [ply]);

  const total = state.moves.length;

  // Le `boardSize` de la partie est calculé pour les panneaux joueurs ; le
  // panneau d'analyse est plus large, le plateau débordait par la gauche.
  const taille = Math.max(
    320,
    Math.min(boardSize, window.innerHeight - 64, window.innerWidth - PANEL_PX - 96),
  );

  return (
    <div className="absolute inset-0 z-50 flex items-stretch justify-center gap-8 bg-[#07050F] px-10 py-6">
      <div className="flex shrink-0 items-center">
        <ChessBoard
          boardRef={boardRef}
          boardSize={taille}
          orientation={orientation}
          theme={theme}
          reduced={reduced}
          pieces={tracked.pieces}
          selection={null}
          lastMove={lastMove}
          checkSquare={checkSquare}
          shakeSquare={null}
          fallenKingSquare={null}
          turnColor={chess.turn() as ChessColor}
          suppressAnim={suppress}
          promotion={null}
          onPromotionPick={() => undefined}
          onSquareTap={() => undefined}
        />
      </div>

      <div className="flex h-full w-[26rem] shrink-0 flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-3xl font-black uppercase text-table-ink">
              {t('table.chess.analysis.title')}
            </h2>
            <p className="mt-1 text-sm text-table-ink-soft">
              {t('table.chess.analysis.sub')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('table.chess.analysis.close')}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/15 text-white/70 active:scale-95"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {!analysis ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <p className="text-lg text-table-ink-soft">{t('table.chess.analysis.computing')}</p>
            <div className="h-2 w-64 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-table-accent transition-[width] duration-200"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            {/* le résumé : ce que la salle retient */}
            <div className="flex items-center gap-2">
              {(['blunder', 'mistake', 'inaccuracy'] as const).map((v) => (
                <span
                  key={v}
                  className={`flex-1 rounded-xl border px-3 py-2 text-center ${
                    VERDICT_STYLE[v].badge || 'border-white/10 bg-white/5 text-white/50'
                  }`}
                >
                  <span className="block font-display text-2xl font-black tabular-nums">
                    {compte[v]}
                  </span>
                  <span className="block text-[11px] uppercase tracking-wider">
                    {t(`table.chess.analysis.${v}`)}
                  </span>
                </span>
              ))}
            </div>

            {analysis.turningPointPly !== null && (
              <button
                type="button"
                onClick={() => setPly(analysis.turningPointPly! + 1)}
                className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-left active:scale-[0.99]"
              >
                <span className="block text-xs uppercase tracking-wider text-rose-300/80">
                  {t('table.chess.analysis.turningPoint')}
                </span>
                <span className="block font-display text-lg font-bold text-rose-200">
                  {t('table.chess.analysis.turningPointAt').replace(
                    '{n}',
                    String(Math.floor(analysis.turningPointPly / 2) + 1),
                  )}
                </span>
              </button>
            )}

            {/* la liste des coups, cliquable */}
            <div ref={listeRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
              {analysis.moves.map((m) => {
                const style = VERDICT_STYLE[m.verdict];
                const actif = m.ply === ply - 1;
                return (
                  <button
                    key={m.ply}
                    data-ply={m.ply}
                    type="button"
                    onClick={() => setPly(m.ply + 1)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${
                      actif ? 'bg-white/15' : 'hover:bg-white/5'
                    }`}
                  >
                    <span className="w-10 shrink-0 text-right text-sm tabular-nums text-white/35">
                      {m.ply % 2 === 0 ? `${m.ply / 2 + 1}.` : ''}
                    </span>
                    <span
                      className={`w-3 shrink-0 rounded-full ${
                        m.color === 'w' ? 'bg-white/80' : 'bg-white/25'
                      }`}
                      style={{ height: '0.75rem' }}
                    />
                    <span className="flex-1 font-display text-lg font-bold text-table-ink">
                      {m.san}
                    </span>
                    {style.icon && (
                      <span className="font-display text-lg font-black" style={{ color: style.color }}>
                        {style.icon}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* le commentaire du coup affiché */}
            <div className="min-h-[4.5rem] rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              {courant ? (
                <>
                  <span
                    className="font-display text-lg font-black"
                    style={{ color: VERDICT_STYLE[courant.verdict].color }}
                  >
                    {courant.san} {VERDICT_STYLE[courant.verdict].icon}{' '}
                    {t(`table.chess.analysis.${courant.verdict}One`)}
                  </span>
                  {courant.bestSan && (
                    <span className="mt-1 block text-sm text-table-ink-soft">
                      {t('table.chess.analysis.better').replace('{san}', courant.bestSan)}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-sm text-table-ink-soft">
                  {t('table.chess.analysis.startPosition')}
                </span>
              )}
            </div>

            {/* navigation */}
            <div className="flex items-center justify-between gap-2">
              <NavBtn onClick={() => setPly(0)} disabled={ply === 0} label="<<">
                <SkipBack className="h-6 w-6" />
              </NavBtn>
              <NavBtn onClick={() => setPly((p) => Math.max(0, p - 1))} disabled={ply === 0} label="<">
                <ChevronLeft className="h-7 w-7" />
              </NavBtn>
              <span className="font-display text-lg font-bold tabular-nums text-table-ink-soft">
                {ply} / {total}
              </span>
              <NavBtn
                onClick={() => setPly((p) => Math.min(total, p + 1))}
                disabled={ply >= total}
                label=">"
              >
                <ChevronRight className="h-7 w-7" />
              </NavBtn>
              <NavBtn onClick={() => setPly(total)} disabled={ply >= total} label=">>">
                <SkipForward className="h-6 w-6" />
              </NavBtn>
            </div>

            <ArcadeButton variant="ghost" size="lg" fullWidth onClick={onClose}>
              {t('table.chess.analysis.close')}
            </ArcadeButton>
          </>
        )}
      </div>
    </div>
  );
}

/** bouton de navigation : cible tactile large, comme le reste des tables */
function NavBtn({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-14 w-16 items-center justify-center rounded-xl border border-white/15 text-table-ink disabled:opacity-25 active:scale-95"
    >
      {children}
    </button>
  );
}
