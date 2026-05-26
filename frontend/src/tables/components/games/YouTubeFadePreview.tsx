/**
 * Preview YouTube avec fade vers une image fallback.
 *
 * Pattern : on cree un sub-div container manuellement (appendChild) que YT
 * prendra en charge. Au cleanup on appelle player.destroy() qui retire l'iframe,
 * puis on retire le container si encore present. Ca evite le bug React
 * "Failed to execute removeChild on Node" qui se produit quand React essaie
 * de demonter un noeud que YT a remplace par une iframe.
 *
 *  - Charge l'API YT IFrame une fois (singleton)
 *  - Polling 250ms : fade vers cover 0.5s avant (startSec + durationSec)
 *  - onStateChange ENDED -> fade aussi
 *  - pointer-events-none sur le wrapper => pas de hover/clic, pas de chrome YT
 *  - cc_load_policy=0 + unloadModule('captions') => sous-titres desactives
 *  - Overlays haut + bas pour masquer titre/uploader/end card/logo YT
 *  - Si API offline ou erreur : fallback image immediat
 */

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement | string,
        config: {
          videoId?: string;
          playerVars?: Record<string, unknown>;
          events?: {
            onReady?: (e: { target: YouTubePlayer }) => void;
            onStateChange?: (e: { data: number; target: YouTubePlayer }) => void;
            onError?: (e: { data: number }) => void;
          };
        },
      ) => YouTubePlayer;
      PlayerState: {
        UNSTARTED: -1;
        ENDED: 0;
        PLAYING: 1;
        PAUSED: 2;
        BUFFERING: 3;
        CUED: 5;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YouTubePlayer {
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  unloadModule?: (module: string) => void;
  setOption?: (module: string, option: string, value: unknown) => void;
}

const FADE_LEAD_TIME_S = 0.5;
const FADE_DURATION_MS = 500;
const POLL_INTERVAL_MS = 250;
const API_LOAD_TIMEOUT_MS = 5000;

let apiReadyPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (apiReadyPromise) return apiReadyPromise;

  apiReadyPromise = new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;

    const timeout = window.setTimeout(() => {
      reject(new Error('YouTube IFrame API timeout'));
    }, API_LOAD_TIMEOUT_MS);

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeout);
      if (previous) {
        try {
          previous();
        } catch {
          /* ignore */
        }
      }
      resolve();
    };

    tag.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error('YouTube IFrame API load error'));
    };

    document.head.appendChild(tag);
  });

  return apiReadyPromise;
}

interface Props {
  videoId: string;
  startSec?: number;
  durationSec?: number | null;
  fallbackImageUrl?: string | null;
  alt?: string;
  className?: string;
}

export default function YouTubeFadePreview({
  videoId,
  startSec = 0,
  durationSec = null,
  fallbackImageUrl = null,
  alt = '',
  className,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const pollRef = useRef<number | null>(null);
  const [videoStarted, setVideoStarted] = useState(false);
  const [videoFading, setVideoFading] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setVideoStarted(false);
    setVideoFading(false);
    setVideoEnded(false);
    setApiError(false);

    if (!wrapperRef.current) return;

    // Container interne cree manuellement => React ne le gere pas (evite le bug
    // removeChild quand YT remplace le noeud par une iframe).
    const ytTarget = document.createElement('div');
    ytTarget.style.width = '100%';
    ytTarget.style.height = '100%';
    wrapperRef.current.appendChild(ytTarget);

    const triggerFadeOut = () => {
      setVideoFading(true);
      window.setTimeout(() => {
        if (!cancelled) setVideoEnded(true);
      }, FADE_DURATION_MS);
    };

    loadYouTubeApi()
      .then(() => {
        if (cancelled || !window.YT) return;

        playerRef.current = new window.YT.Player(ytTarget, {
          videoId,
          playerVars: {
            start: Math.max(0, Math.floor(startSec)),
            autoplay: 1,
            mute: 1,
            controls: 0,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            disablekb: 1,
            iv_load_policy: 3, // pas d'annotations
            cc_load_policy: 0, // pas de sous-titres CC par defaut
            fs: 0,
          },
          events: {
            onReady: (e) => {
              try {
                e.target.mute();
                e.target.playVideo();
                // Tentatives multiples pour decharger les sous-titres
                try { e.target.unloadModule?.('captions'); } catch { /* ignore */ }
                try { e.target.unloadModule?.('cc'); } catch { /* ignore */ }
                try { e.target.setOption?.('captions', 'track', {}); } catch { /* ignore */ }
              } catch {
                /* ignore */
              }
            },
            onStateChange: (e) => {
              if (e.data === 1 /* PLAYING */) {
                // La lecture a vraiment demarre : on peut maintenant afficher
                // l'iframe (jusqu'ici elle etait masquee par la cover image).
                if (!cancelled) setVideoStarted(true);
                // Re-tente de decharger les CC (certaines videos les reactivent
                // au demarrage de la lecture, malgre cc_load_policy=0)
                try { e.target.unloadModule?.('captions'); } catch { /* ignore */ }
                try { e.target.setOption?.('captions', 'track', {}); } catch { /* ignore */ }
              }
              if (e.data === 0 /* ENDED */ && !videoFading) {
                triggerFadeOut();
              }
            },
            onError: () => {
              setApiError(true);
            },
          },
        });

        // Polling pour detecter (startSec + durationSec) - currentTime <= 0.5
        pollRef.current = window.setInterval(() => {
          const p = playerRef.current;
          if (!p) return;
          try {
            const current = p.getCurrentTime();
            const stopAt = durationSec != null && durationSec > 0
              ? startSec + durationSec
              : null;
            if (stopAt != null) {
              const remaining = stopAt - current;
              if (remaining <= FADE_LEAD_TIME_S && !videoFading) {
                triggerFadeOut();
              }
            }
          } catch {
            /* ignore */
          }
        }, POLL_INTERVAL_MS);
      })
      .catch(() => {
        if (cancelled) return;
        setApiError(true);
      });

    return () => {
      cancelled = true;
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          /* ignore */
        }
        playerRef.current = null;
      }
      // Nettoyage du container si encore present (destroy() le retire normalement)
      try {
        if (ytTarget.parentNode) {
          ytTarget.parentNode.removeChild(ytTarget);
        }
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, startSec, durationSec]);

  // Image cover visible :
  //  - avant que la video ait demarre (masque le boot YT, le bouton pause central)
  //  - quand la video est terminee
  //  - en cas d'erreur (kiosk offline)
  const showFallbackImage = (!videoStarted || videoEnded || apiError) && !!fallbackImageUrl;
  // Iframe visible uniquement quand la lecture a demarre, et avant le fade out
  const videoOpacity = !videoStarted || videoEnded || apiError ? 0 : (videoFading ? 0 : 1);

  return (
    <div
      className={[
        'relative aspect-video w-full overflow-hidden rounded-2xl border border-white/15 bg-black/40 shadow-glass',
        className ?? '',
      ].join(' ')}
    >
      {/* Player YouTube : wrapper React qui ne contient PAS de div data-yt-player
          (cree manuellement via appendChild). pointer-events-none = pas de chrome YT. */}
      <div
        ref={wrapperRef}
        aria-hidden={videoEnded || apiError}
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{
          opacity: videoOpacity,
          transition: `opacity ${FADE_DURATION_MS}ms ease-out`,
        }}
      />

      {/* Overlay haut : masque titre + uploader (visibles au demarrage YT) */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20"
        style={{
          background: 'linear-gradient(to bottom, rgba(10,6,18,1) 0%, rgba(10,6,18,0.95) 40%, rgba(10,6,18,0.5) 80%, rgba(10,6,18,0) 100%)',
          opacity: videoOpacity,
          transition: `opacity ${FADE_DURATION_MS}ms ease-out`,
        }}
      />

      {/* Overlay bas : masque "Plus de videos", logo YT, sous-titres CC residuels, barre de progression */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-28"
        style={{
          background: 'linear-gradient(to top, rgba(10,6,18,1) 0%, rgba(10,6,18,0.95) 40%, rgba(10,6,18,0.55) 75%, rgba(10,6,18,0) 100%)',
          opacity: videoOpacity,
          transition: `opacity ${FADE_DURATION_MS}ms ease-out`,
        }}
      />

      {/* Image fallback : visible apres la fin de la video ou en cas d'erreur */}
      {fallbackImageUrl && (
        <img
          src={fallbackImageUrl}
          alt={alt}
          className="absolute inset-0 z-[5] h-full w-full object-cover"
          style={{
            opacity: showFallbackImage ? 1 : 0,
            transition: `opacity ${FADE_DURATION_MS}ms ease-in`,
          }}
          draggable={false}
        />
      )}
    </div>
  );
}
