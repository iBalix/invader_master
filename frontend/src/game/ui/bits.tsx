/**
 * Petits composants partagés des surfaces de jeu (joueur + écrans).
 * Design : dark néon, cohérent avec le launcher des tables tactiles.
 */

import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

// ---------------------------------------------------------------------------
// QR code (canvas, sans dépendance réseau)
// ---------------------------------------------------------------------------

export function QrCanvas({ value, size = 200 }: { value: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    void QRCode.toCanvas(ref.current, value, {
      width: size,
      margin: 1,
      color: { dark: '#0a0a14', light: '#ffffff' },
    });
  }, [value, size]);
  return <canvas ref={ref} className="rounded-xl bg-white p-1" style={{ width: size, height: size }} />;
}

/** QR de connexion WiFi (format standard, scannable par l'appareil photo) */
export function wifiQrValue(ssid: string, password: string): string {
  const esc = (s: string) => s.replace(/([\\;,:"])/g, '\\$1');
  return password
    ? `WIFI:T:WPA;S:${esc(ssid)};P:${esc(password)};;`
    : `WIFI:T:nopass;S:${esc(ssid)};;`;
}

// ---------------------------------------------------------------------------
// Timer circulaire synchronisé serveur
// ---------------------------------------------------------------------------

export function TimerRing({
  remainingMs,
  totalMs,
  size = 72,
}: {
  remainingMs: number;
  totalMs: number;
  size?: number;
}) {
  const ratio = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  const seconds = Math.ceil(remainingMs / 1000);
  const r = size / 2 - 5;
  const circumference = 2 * Math.PI * r;
  const urgent = seconds <= 5;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="5" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={urgent ? '#ff4d5e' : '#4cc9f0'}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          style={{ transition: 'stroke-dashoffset 0.25s linear, stroke 0.3s' }}
        />
      </svg>
      <span
        className={`absolute font-bold tabular-nums ${urgent ? 'text-red-400 animate-pulse' : 'text-white'}`}
        style={{ fontSize: size * 0.34 }}
      >
        {seconds}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badges difficulté / points / type
// ---------------------------------------------------------------------------

export const DIFFICULTY_COLORS: Record<string, string> = {
  Facile: 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10',
  Moyen: 'text-amber-300 border-amber-400/40 bg-amber-400/10',
  Difficile: 'text-rose-300 border-rose-400/40 bg-rose-400/10',
};

export function DifficultyBadge({ difficulty, className = '' }: { difficulty: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold uppercase tracking-wider ${
        DIFFICULTY_COLORS[difficulty] ?? DIFFICULTY_COLORS.Moyen
      } ${className}`}
    >
      {difficulty}
    </span>
  );
}

export function PointsBadge({
  points,
  upTo = false,
  className = '',
}: {
  points: number;
  /** estimation : le bareme depend de l'ecart, on annonce le meilleur palier */
  upTo?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-1 text-sm font-bold text-cyan-300 ${className}`}
    >
      {upTo ? 'jusqu\u2019à ' : ''}{points} pt{points > 1 ? 's' : ''}
    </span>
  );
}

export const TYPE_LABELS: Record<string, string> = {
  qcm: 'QCM',
  estimation: 'Estimation',
  free_text: 'Réponse libre',
};

export const SPECIAL_LABELS: Record<string, { label: string; emoji: string }> = {
  double: { label: 'POINTS X2', emoji: '✨' },
  quitte_double: { label: 'QUITTE OU DOUBLE COLLECTIF', emoji: '⚡' },
  shot: { label: 'SHOT POUR LE PLUS RAPIDE', emoji: '🥃' },
  goodies: { label: 'GOODIES POUR LE PLUS RAPIDE', emoji: '🎁' },
};

// ---------------------------------------------------------------------------
// Extrait YouTube (format legacy "ID?time=SS&duration=SS")
// ---------------------------------------------------------------------------

export function parseYoutube(spec: string | null | undefined): {
  videoId: string;
  start: number;
  end: number;
} | null {
  if (!spec) return null;
  const m = spec.match(/^([a-zA-Z0-9_-]{11})\?time=(\d+)&duration=(\d+)$/);
  if (!m) return null;
  const start = parseInt(m[2], 10);
  return { videoId: m[1], start, end: start + parseInt(m[3], 10) };
}

export function YoutubeClip({ spec, muted = false }: { spec: string; muted?: boolean }) {
  const parsed = parseYoutube(spec);
  if (!parsed) return null;
  const src = `https://www.youtube.com/embed/${parsed.videoId}?autoplay=1&start=${parsed.start}&end=${parsed.end}&controls=0&disablekb=1&modestbranding=1&rel=0${muted ? '&mute=1' : ''}`;
  return (
    <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black">
      <iframe
        className="h-full w-full"
        src={src}
        title="Extrait"
        allow="autoplay; encrypted-media"
        allowFullScreen={false}
      />
    </div>
  );
}
