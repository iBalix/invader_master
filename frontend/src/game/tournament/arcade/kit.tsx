/**
 * Briques communes de l'identité arcade des tournois : scène, lettrage
 * chromé, étiquette du jeu, rangs, trophée, panneau d'inscription.
 * Utilisées par le projecteur, les TV du comptoir, le téléphone et la
 * console du GM. Aucune logique de tournoi ici, seulement de l'affichage.
 */

import type { CSSProperties, ReactNode } from 'react';
import { QrCanvas } from '../../ui/bits';
import type { TournamentPublicState } from '../tournamentTypes';
import {
  BOLT,
  CROWN,
  CUP,
  FLAG,
  INVADERS,
  KNIGHT,
  PAWN,
  PAWN_BLACK,
  PAWN_WHITE,
  PixelFrames,
  PixelSprite,
  TROPHY,
  TROPHY_BRONZE,
  TROPHY_SILVER,
} from './pixel';
import './arcade.css';

// ---------------------------------------------------------------------------
// Scène
// ---------------------------------------------------------------------------

/**
 * Fond commun : nuit violette, halo, sol en grille néon et balayage
 * cathodique. `floor` règle la hauteur du sol (0 = pas de grille).
 */
export function ArcadeStage({
  children,
  className = '',
  floor = 0.3,
  floorOpacity = 0.5,
  cell = 72,
  scan = 0.14,
  style,
}: {
  children: ReactNode;
  className?: string;
  floor?: number;
  floorOpacity?: number;
  cell?: number;
  scan?: number;
  style?: CSSProperties;
}) {
  const vars = {
    '--ia-floor-h': `${Math.round(floor * 100)}%`,
    '--ia-floor-o': floorOpacity,
    '--ia-floor-cell': `${cell}px`,
    '--ia-scan': scan,
    ...style,
  } as CSSProperties;
  return (
    <div className={`ia-stage ${scan > 0 ? 'ia-scan' : ''} ${className}`} style={vars}>
      {floor > 0 && (
        <>
          <div className="ia-floor" aria-hidden />
          <div className="ia-horizon" aria-hidden />
        </>
      )}
      {children}
    </div>
  );
}

/** lettrage chromé du logo INVADER (élément en ligne) */
export function Chrome({ children, gold = false, className = '' }: { children: ReactNode; gold?: boolean; className?: string }) {
  return (
    <span className={`ia-chrome-fx ${gold ? 'ia-chrome-fx--gold' : ''}`}>
      <span className={`ia-chrome ${gold ? 'ia-chrome--gold' : ''} ${className}`}>{children}</span>
    </span>
  );
}

/** taille d'un pseudo en grand chrome (16 caractères au plus) */
export function nameSize(pseudo: string, sizes: [string, string, string, string]): string {
  const n = pseudo.length;
  return n <= 6 ? sizes[0] : n <= 9 ? sizes[1] : n <= 12 ? sizes[2] : sizes[3];
}

/** taille du titre chromé selon sa longueur (Orbitron est très large) */
export function chromeSize(text: string, sizes: [string, string, string, string]): string {
  const n = text.length;
  return n <= 16 ? sizes[0] : n <= 26 ? sizes[1] : n <= 40 ? sizes[2] : sizes[3];
}

/** étiquette en police pixel */
export function Px({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`ia-pixel ${className}`}>{children}</span>;
}

// ---------------------------------------------------------------------------
// Jeu du tournoi
// ---------------------------------------------------------------------------

export type TournamentGame = 'chess' | 'mariokart' | 'smash' | string;

export function gameAccent(game: TournamentGame): string {
  if (game === 'mariokart') return 'text-ia-gold';
  if (game === 'smash') return 'text-ia-pink';
  return 'text-ia-cyan';
}

/** pictogramme pixel du jeu : cavalier, drapeau à damier, éclair */
export function GameGlyph({ game, scale = 3, className = '' }: { game: TournamentGame; scale?: number; className?: string }) {
  if (game === 'mariokart') return <PixelSprite sprite={FLAG} scale={scale} className={className} />;
  if (game === 'smash') return <PixelSprite sprite={BOLT} scale={scale} className={`text-ia-gold ${className}`} />;
  if (game === 'chess') return <PixelSprite sprite={KNIGHT} scale={scale} className={`text-ia-cyan ${className}`} />;
  return <PixelSprite sprite={CUP} scale={scale} className={`text-ia-gold ${className}`} />;
}

const TAG_SIZES = {
  sm: { box: 'gap-2 px-3 py-1.5', text: 'text-xs', glyph: 2 },
  md: { box: 'gap-3 px-4 py-2', text: 'text-base', glyph: 3 },
  lg: { box: 'gap-4 px-6 py-3', text: 'text-2xl', glyph: 4 },
  xl: { box: 'gap-5 px-7 py-4', text: 'text-3xl', glyph: 5 },
} as const;

/** « ♞ ÉCHECS · RONDES SUISSES » en étiquette de borne, avec TEST si besoin */
export function GameTag({
  state,
  size = 'md',
  className = '',
}: {
  state: Pick<TournamentPublicState, 'game' | 'gameLabel' | 'formatLabel'> & { config: { testMode: boolean } };
  size?: keyof typeof TAG_SIZES;
  className?: string;
}) {
  const s = TAG_SIZES[size];
  return (
    <span className={`ia-px ia-px--deep inline-flex w-fit max-w-full items-center ${s.box} ${className}`}>
      <GameGlyph game={state.game} scale={s.glyph} />
      <span className={`ia-pixel ${s.text} ${gameAccent(state.game)}`}>{state.gameLabel}</span>
      <span className={`ia-pixel ${s.text} text-ia-muted`}>·</span>
      <span className={`ia-pixel ${s.text} text-ia-soft`}>{state.formatLabel}</span>
      {state.config.testMode && (
        <span className={`ia-pixel ia-clip ia-clip--sm bg-ia-amber px-2 py-1 ${s.text} text-ia-night`}>Test</span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Rangs, pions, envahisseurs
// ---------------------------------------------------------------------------

export function rankClass(rank: number, ranked = true): string {
  if (!ranked) return 'text-ia-muted';
  if (rank === 1) return 'ia-rank-1';
  if (rank === 2) return 'ia-rank-2';
  if (rank === 3) return 'ia-rank-3';
  return 'text-ia-soft';
}

/** rang façon high score : « 1ER », « 2E »... avec « = » en cas d'égalité */
export function rankText(rank: number): string {
  return rank === 1 ? '1er' : `${rank}e`;
}

export function Crown({ scale = 3, className = '' }: { scale?: number; className?: string }) {
  return <PixelSprite sprite={CROWN} scale={scale} className={className} title="En tête" />;
}

export function Pawn({ color, scale = 3, className = '' }: { color: 'w' | 'b' | null; scale?: number; className?: string }) {
  if (!color) return null;
  return (
    <PixelSprite
      sprite={PAWN}
      scale={scale}
      palette={color === 'w' ? PAWN_WHITE : PAWN_BLACK}
      className={className}
      title={color === 'w' ? 'Blancs' : 'Noirs'}
    />
  );
}

/** envahisseur choisi d'après une clé (pseudo, id) : chaque joueur garde le sien */
export function Invader({
  seed = 0,
  scale = 3,
  className = '',
  animate = false,
}: {
  seed?: string | number;
  scale?: number;
  className?: string;
  animate?: boolean;
}) {
  const n = typeof seed === 'number' ? seed : [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const [a, b] = INVADERS[n % INVADERS.length];
  return <PixelFrames a={a} b={b} scale={scale} className={className} animate={animate} />;
}

/** couleur d'envahisseur d'après une clé (cycle néon du bar) */
export function invaderTone(seed: string | number): string {
  const tones = ['text-ia-cyan', 'text-ia-pink', 'text-ia-gold', 'text-ia-mint', 'text-ia-violet'];
  const n = typeof seed === 'number' ? seed : [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return tones[n % tones.length];
}

// ---------------------------------------------------------------------------
// Trophée
// ---------------------------------------------------------------------------

export function Trophy({ scale = 8, metal = 'gold', className = '' }: { scale?: number; metal?: 'gold' | 'silver' | 'bronze'; className?: string }) {
  const palette = metal === 'silver' ? TROPHY_SILVER : metal === 'bronze' ? TROPHY_BRONZE : undefined;
  return <PixelSprite sprite={TROPHY} scale={scale} palette={palette} className={className} title="Trophée" />;
}

/**
 * Trophée mis en scène : rayons dorés qui tournent lentement, trophée qui
 * flotte en paliers, éclats de pixels autour.
 */
export function TrophyShowcase({ scale = 10, rays = true, className = '' }: { scale?: number; rays?: boolean; className?: string }) {
  const w = 28 * scale;
  const h = 32 * scale;
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: w * 1.9, height: h * 1.25 }}>
      {rays && <div className="ia-rays absolute" style={{ width: w * 2.4, height: w * 2.4 }} aria-hidden />}
      <div className="absolute rounded-full" style={{ width: w * 1.1, height: w * 1.1, background: 'radial-gradient(circle, rgba(255,233,85,0.35), transparent 65%)' }} aria-hidden />
      <Sparkle className="absolute" style={{ left: '4%', top: '8%' }} size={scale * 1.6} delay={0} />
      <Sparkle className="absolute" style={{ right: '3%', top: '24%' }} size={scale * 1.2} delay={0.6} />
      <Sparkle className="absolute" style={{ left: '10%', bottom: '10%' }} size={scale} delay={1.1} />
      <div className="ia-float relative">
        <Trophy scale={scale} />
      </div>
    </div>
  );
}

/** éclat en croix de pixels (clignote) */
export function Sparkle({ size = 16, className = '', style, delay = 0 }: { size?: number; className?: string; style?: CSSProperties; delay?: number }) {
  return (
    <svg
      width={size * 5}
      height={size * 5}
      viewBox="0 0 5 5"
      shapeRendering="crispEdges"
      className={`ia-blink ${className}`}
      style={{ animationDelay: `${delay}s`, ...style }}
      aria-hidden
    >
      <rect x="2" y="0" width="1" height="5" fill="#fff6c2" />
      <rect x="0" y="2" width="5" height="1" fill="#fff6c2" />
      <rect x="2" y="2" width="1" height="1" fill="#ffffff" />
    </svg>
  );
}

/** pluie de confettis carrés aux couleurs du bar */
export function PixelConfetti({ count = 36, size = 14 }: { count?: number; size?: number }) {
  const colors = ['#ff2bd6', '#33e2ff', '#ffe955', '#8b3dff', '#5ed9a1'];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="ia-confetti"
          style={{
            left: `${(i * 37 + 11) % 100}%`,
            width: size,
            height: size,
            background: colors[i % colors.length],
            animationDuration: `${5 + (i % 6)}s`,
            animationDelay: `${(i % 12) * 0.45}s`,
            animationTimingFunction: `steps(${18 + (i % 7)}, end)`,
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Horloge, progression
// ---------------------------------------------------------------------------

export function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** barre en segments (avancement d'une ronde) */
export function Meter({ ratio, color = '#5ed9a1', className = '', height }: { ratio: number; color?: string; className?: string; height?: number }) {
  return (
    <div className={`ia-meter ia-clip ia-clip--sm ${className}`} style={{ '--seg': color, height } as CSSProperties}>
      <span style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inscription : WiFi puis QR (écrans du bar)
// ---------------------------------------------------------------------------

/**
 * Les deux étapes pour rejoindre le tournoi, version borne : même contenu que
 * le panneau du quiz (WiFi, QR, code), lisible de loin.
 */
export function JoinSteps({
  wifiSsid,
  wifiPassword,
  url,
  code,
  title = "Scanne pour t'inscrire",
  text = 'Un pseudo suffit.',
  qrSize = 240,
  compact = false,
}: {
  wifiSsid: string;
  wifiPassword: string;
  url: string;
  code?: string;
  title?: string;
  text?: string;
  qrSize?: number;
  /** TV du comptoir à côté d'autres infos : étapes plus serrées */
  compact?: boolean;
}) {
  const pad = compact ? 'px-6 py-5' : 'px-8 py-6';
  return (
    <div className="flex w-full flex-col gap-5">
      <div className={`ia-px ia-px--lg ia-px--cyan flex items-center gap-6 ${pad}`}>
        <StepNumber n={1} tone="cyan" />
        <div className="min-w-0 text-left">
          <p className="ia-pixel text-2xl text-ia-cyan">WiFi</p>
          <p className="ia-display mt-1 truncate text-6xl text-white">{wifiSsid}</p>
          {wifiPassword && (
            <p className="mt-1 text-2xl text-ia-soft">
              mot de passe <span className="font-black text-white">{wifiPassword}</span>
            </p>
          )}
        </div>
      </div>
      <div className={`ia-px ia-px--lg ia-px--pink ia-glow-pink flex items-center gap-6 ${pad}`}>
        <StepNumber n={2} tone="pink" />
        <div className="min-w-0 flex-1 text-left">
          <p className="ia-pixel text-2xl leading-tight text-ia-pink">{title}</p>
          <p className="mt-2 text-2xl leading-snug text-ia-soft">{text}</p>
          {code && (
            <div className="mt-4">
              <p className="ia-pixel text-lg text-ia-muted">ou tape le code</p>
              <p className="ia-pixel mt-1 text-6xl tracking-[0.12em] text-white ia-neon">{code}</p>
            </div>
          )}
        </div>
        <QrFrame value={url} size={qrSize} />
      </div>
    </div>
  );
}

function StepNumber({ n, tone }: { n: number; tone: 'cyan' | 'pink' }) {
  return (
    <span
      className={`ia-pixel ia-clip flex h-16 w-16 shrink-0 items-center justify-center text-3xl text-ia-night ${
        tone === 'cyan' ? 'bg-ia-cyan' : 'bg-ia-pink'
      }`}
    >
      {n}
    </span>
  );
}

/** QR sur fond blanc, cadre à coins de pixels */
export function QrFrame({ value, size = 200 }: { value: string; size?: number }) {
  return (
    <div className="ia-clip shrink-0 bg-white p-2" style={{ '--s': `${Math.max(4, Math.round(size / 40))}px` } as CSSProperties}>
      <QrCanvas value={value} size={size} />
    </div>
  );
}
