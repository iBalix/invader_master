/**
 * Petits composants partagés des surfaces de jeu (joueur + écrans).
 * Design : dark néon, cohérent avec le launcher des tables tactiles.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
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

/**
 * Libelle de MEDIA, distinct du type : « vidéo », « image » ou « audio ».
 *
 * Le type d'une question n'est que QCM, Estimation ou Réponse libre. Le support
 * est une information a part, affichee dans sa propre etiquette : « QCM » +
 * « vidéo », jamais « QCM vidéo sans média » ni autre bouillie.
 *
 * L'image de REPONSE est volontairement ignoree : elle sert a expliciter la
 * solution une fois le suspense fini, elle ne dit rien de la maniere de jouer.
 */
export function mediaLabel(q: {
  musicUrl?: string | null;
  videoYoutube?: string | null;
  imageQuestionUrl?: string | null;
}): string | null {
  if (q.videoYoutube) return 'vidéo';
  if (q.musicUrl) return 'audio';
  if (q.imageQuestionUrl) return 'image';
  return null;
}

/**
 * Bandeau d'annonce des medias qui demandent de se PREPARER : l'extrait audio
 * joue seul avant la question, la video passe plein ecran avant elle. La salle
 * doit le savoir avant, pas le decouvrir (retour de soiree : la pastille
 * « audio » perdue parmi quatre badges ne preparait personne). L'image, elle,
 * n'a rien a preparer et reste une simple etiquette.
 */
export const MEDIA_ANNONCE: Record<'audio' | 'vidéo', { emoji: string; titre: string; sous: string }> = {
  audio: { emoji: '🎧', titre: 'Extrait audio', sous: "Tends l'oreille, l'extrait joue avant la question" },
  'vidéo': { emoji: '🎬', titre: 'Vidéo', sous: "Regarde l'écran, la vidéo passe avant la question" },
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

/**
 * Clip YouTube, volume pilotable depuis le mixer de la console.
 *
 * Le volume d'une iframe YouTube ne se regle pas en CSS ni par attribut : il
 * faut passer par l'API JS du player. D'ou `enablejsapi=1` et un postMessage
 * `setVolume`. On le renvoie a chaque changement ET a l'evenement load, parce
 * qu'un message envoye avant que le player soit pret est perdu sans erreur.
 */
/**
 * Extrait vidéo plein écran de la phase 'media' (question vidéo).
 *
 * MONTÉ DÈS L'ANNONCE, caché : l'iframe et le lecteur YouTube se chargent
 * pendant que la salle lit le thème, si bien qu'au passage en phase 'media'
 * il n'y a plus qu'à lancer la lecture - c'est le préchargement demandé, sans
 * lequel la vidéo démarrait avec une à deux secondes d'écran noir. Le
 * composant doit donc rester monté (même position dans l'arbre) de l'annonce
 * jusqu'à la fin de l'extrait : le démonter le ferait recharger.
 *
 * `autoplay=0` : le lecteur reste sagement en attente pendant l'annonce, la
 * lecture part par postMessage quand `active` passe à vrai. Les dalles
 * l'affichent en muet (le son vient de la sono du bar, via le projecteur :
 * cinq lecteurs légèrement désynchronisés s'entendraient).
 */
export function FullscreenVideo({
  spec,
  active,
  muted = false,
  volume,
  onEnded,
}: {
  spec: string;
  /** vrai pendant la phase 'media' : la vidéo se montre et se lance */
  active: boolean;
  muted?: boolean;
  /** 0 a 1 ; ignore si muted */
  volume?: number;
  /** fin de lecture detectee (le projo y ramene la musique de fond en fondu) */
  onEnded?: () => void;
}) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const parsed = parseYoutube(spec);
  const startRef = useRef(parsed?.start ?? 0);
  startRef.current = parsed?.start ?? 0;

  const cmd = useCallback((func: string, args: unknown[] = []) => {
    ref.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args }),
      '*',
    );
  }, []);

  // le volume vit dans une ref : `lancer` ne doit dependre QUE de `cmd`,
  // sinon un coup de mixette du GM pendant l'extrait rejoue l'effet de
  // lecture, dont le seekTo, et la video repart au debut sur le projo
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  // Fin de lecture : la video atteint son `end` un peu AVANT la fin de la
  // phase 'media' (battement serveur). Sans rien faire, la salle voyait le
  // lecteur arrete (vignette, bouton replay) pendant ce battement. On ecoute
  // donc l'evenement de fin du lecteur et on fond l'iframe vers le noir : la
  // sequence devient video -> noir -> question, jamais de lecteur fige.
  const [finie, setFinie] = useState(false);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const lancer = useCallback(() => {
    const v = volumeRef.current;
    if (v !== undefined) cmd('setVolume', [Math.round(Math.min(1, Math.max(0, v)) * 100)]);
    cmd('seekTo', [startRef.current, true]);
    cmd('playVideo');
    // demande au lecteur d'emettre ses evenements (protocole widget YouTube) ;
    // renvoye a chaque lancement, un doublon est sans effet
    ref.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1 }), '*');
  }, [cmd]);

  useEffect(() => {
    if (!active) {
      setFinie(false);
      return;
    }
    const onMessage = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow || typeof e.data !== 'string') return;
      try {
        const d = JSON.parse(e.data) as { event?: string; info?: unknown };
        // la fin arrive sous deux formes selon les versions du lecteur
        const etat =
          d.event === 'onStateChange'
            ? (d.info as number)
            : (d.info as { playerState?: number } | undefined)?.playerState;
        if (etat === 0) {
          setFinie(true);
          onEndedRef.current?.();
        }
      } catch {
        // message non JSON d'une autre iframe : ignorer
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [active]);

  // lecture / pause : uniquement quand la phase bascule
  useEffect(() => {
    if (active) lancer();
    else cmd('pauseVideo');
  }, [active, lancer, cmd]);

  // volume a chaud, sans toucher a la lecture en cours
  useEffect(() => {
    if (!active || volume === undefined) return;
    cmd('setVolume', [Math.round(Math.min(1, Math.max(0, volume)) * 100)]);
  }, [volume, active, cmd]);

  if (!parsed) return null;
  // iv_load_policy=3 (pas d'annotations), fs=0, cc_load_policy=0 : le reste
  // (controls=0, modestbranding, rel=0) vient d'invader_table, mais ces
  // parametres ne suffisent plus a masquer le titre.
  const src = `https://www.youtube.com/embed/${parsed.videoId}?autoplay=0&start=${parsed.start}&end=${parsed.end}&controls=0&disablekb=1&modestbranding=1&rel=0&iv_load_policy=3&fs=0&cc_load_policy=0&playsinline=1&enablejsapi=1${muted ? '&mute=1' : ''}`;
  return (
    <div
      className={`fixed inset-0 z-30 bg-black transition-opacity duration-300 ${
        active ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <iframe
        ref={ref}
        className={`h-full w-full transition-opacity duration-500 ${finie ? 'opacity-0' : 'opacity-100'}`}
        src={src}
        title="Extrait vidéo"
        allow="autoplay; encrypted-media"
        allowFullScreen={false}
        // le lecteur peut finir de charger APRES le passage en 'media'
        // (annonce ecourtee) : on relance la sequence a ce moment-la
        onLoad={() => {
          if (activeRef.current) lancer();
        }}
      />
      {/* CACHES ANTI-SPOILER. L'overlay YouTube (titre + chaine) apparait au
          demarrage et a la pause malgre controls=0, et le titre contient
          souvent LA reponse de la question. Bandeau cinema en haut, pave sur
          le watermark en bas a droite. Toujours presents : un cache qui
          clignote attirerait l'oeil au pire moment. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[12vh] bg-gradient-to-b from-black via-black/90 to-transparent" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-16 w-64 bg-gradient-to-tl from-black via-black/95 to-transparent" />
    </div>
  );
}

export function YoutubeClip({
  spec,
  muted = false,
  volume,
  playing = true,
}: {
  spec: string;
  muted?: boolean;
  /** 0 a 1 ; absent = volume par defaut de YouTube */
  volume?: number;
  /**
   * Passe a false des que la fenetre de reponse se ferme. L'extrait ne
   * s'arrete pas tout seul quand le chrono expire avant sa fin : il continuait
   * alors que la musique de fond remontait, et on entendait les deux.
   */
  playing?: boolean;
}) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const parsed = parseYoutube(spec);

  const appliquerVolume = useCallback(() => {
    if (volume === undefined || !ref.current?.contentWindow) return;
    const pct = Math.round(Math.min(1, Math.max(0, volume)) * 100);
    ref.current.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func: 'setVolume', args: [pct] }),
      '*',
    );
  }, [volume]);

  useEffect(() => {
    appliquerVolume();
  }, [appliquerVolume]);

  useEffect(() => {
    const win = ref.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      JSON.stringify({ event: 'command', func: playing ? 'playVideo' : 'pauseVideo', args: [] }),
      '*',
    );
  }, [playing]);

  if (!parsed) return null;
  const src = `https://www.youtube.com/embed/${parsed.videoId}?autoplay=1&start=${parsed.start}&end=${parsed.end}&controls=0&disablekb=1&modestbranding=1&rel=0&enablejsapi=1${muted ? '&mute=1' : ''}`;
  return (
    <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black">
      <iframe
        ref={ref}
        className="h-full w-full"
        src={src}
        title="Extrait"
        allow="autoplay; encrypted-media"
        allowFullScreen={false}
        onLoad={appliquerVolume}
      />
    </div>
  );
}
