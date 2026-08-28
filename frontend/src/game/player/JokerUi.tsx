/**
 * UI des jokers côté joueur : slots de main (StatusBar) et barre d'activation.
 *
 * La barre ne vit QUE pendant l'annonce, avant que la question s'affiche : les
 * trois jokers s'engagent à l'aveugle, sur la seule promesse du thème et de la
 * difficulté. C'est un pari, pas une aide de dernière seconde, et ça évite au
 * joueur d'avoir à lire une question tout en arbitrant ses jokers.
 *
 * Le 50/50 et l'avis du public sont grisés hors QCM (le serveur les refuse de
 * toute façon, mais un bouton qui échoue est pire qu'un bouton grisé) : le type
 * de question est annoncé, le joueur sait donc à quoi s'en tenir.
 */

import { useState } from 'react';
import {
  ApiError,
  gameApi,
  JOKER_DEFS,
  JOKER_HAND_MAX,
  type JokerPlayYou,
  type JokerType,
  type PublicState,
  type You,
} from '../lib/gameClient';

const ERROR_LABELS: Record<string, string> = {
  error_no_joker: "Tu n'as pas ce joker",
  error_joker_type: 'Ce joker ne marche que sur les QCM',
  error_bonus_window_closed: 'Trop tard, la question est lancée !',
};

/** slots de main compacts pour la barre de statut */
export function JokerSlots({ jokers }: { jokers: JokerType[] }) {
  return (
    <span className="flex items-center gap-1">
      {Array.from({ length: JOKER_HAND_MAX }, (_, i) => {
        const t = jokers[i];
        return t ? (
          <span
            key={i}
            className="flex h-6 w-6 items-center justify-center rounded-full border text-xs"
            style={{ borderColor: `${JOKER_DEFS[t].couleur}66`, background: `${JOKER_DEFS[t].couleur}22` }}
            title={JOKER_DEFS[t].label}
          >
            {JOKER_DEFS[t].emoji}
          </span>
        ) : (
          <span key={i} className="h-6 w-6 rounded-full border border-dashed border-white/15" />
        );
      })}
    </span>
  );
}

interface BarProps {
  state: PublicState;
  you: You;
  sessionRef: string;
  playerToken: string | null;
  refresh: () => Promise<void>;
  /** resultat d'un joker d'info, pour l'affichage cote QuestionScreen */
  onPlayed?: (type: JokerType, data: JokerPlayYou['data']) => void;
  embedded?: boolean;
}

export function JokerBar({ state, you, sessionRef, playerToken, refresh, onPlayed, embedded }: BarProps) {
  const [busy, setBusy] = useState<JokerType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const q = state.question;
  if (!q) return null;

  const isQcm = q.type === 'qcm';
  const played = new Set(you.jokerPlays.map((p) => p.type));
  // main + jokers deja joues sur CETTE question : un joker joue reste visible
  // en etat "actif" au lieu de disparaitre de la barre
  const visibles: JokerType[] = [...you.jokers, ...you.jokerPlays.map((p) => p.type)];

  if (visibles.length === 0) {
    return (
      <p className={`text-center text-white/35 ${embedded ? 'text-base' : 'text-xs'}`}>
        Pas de joker en main — les bonnes réponses en font gagner !
      </p>
    );
  }

  const jouer = async (type: JokerType) => {
    if (!playerToken || busy) return;
    setBusy(type);
    setError(null);
    try {
      const res = await gameApi.joker(sessionRef, { playerToken, questionIndex: q.index, type });
      onPlayed?.(type, res.data ?? null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? (ERROR_LABELS[err.message] ?? 'Erreur réseau') : 'Erreur réseau');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="w-full">
      <div className={`flex w-full items-stretch justify-center gap-2 ${embedded ? 'gap-4' : ''}`}>
        {visibles.map((type, i) => {
          const def = JOKER_DEFS[type];
          const actif = played.has(type);
          // le 50/50 et l'avis ne s'appliquent qu'a un QCM
          const inutilisable = !actif && (type === 'fifty' || type === 'audience') && !isQcm;
          return (
            <button
              key={`${type}-${i}`}
              type="button"
              disabled={actif || inutilisable || busy !== null}
              onClick={() => void jouer(type)}
              className={`anim-pop flex min-w-0 flex-1 flex-col items-center rounded-2xl border-2 px-2 text-center transition-transform active:scale-95 ${
                embedded ? 'max-w-[16rem] py-4' : 'max-w-[9rem] py-2.5'
              } ${inutilisable ? 'opacity-35' : ''}`}
              style={{
                animationDelay: `${i * 0.08}s`,
                borderColor: actif ? def.couleur : `${def.couleur}55`,
                background: actif ? `${def.couleur}2e` : 'rgba(255,255,255,0.04)',
                boxShadow: actif ? `0 0 24px ${def.ombre}` : undefined,
              }}
            >
              <span className={embedded ? 'text-4xl' : 'text-2xl'}>{def.emoji}</span>
              <span
                className={`mt-1 font-black uppercase tracking-wide ${embedded ? 'text-base' : 'text-[11px]'}`}
                style={{ color: def.couleur }}
              >
                {def.label}
              </span>
              <span className={`mt-0.5 font-semibold uppercase tracking-wider text-white/45 ${embedded ? 'text-xs' : 'text-[9px]'}`}>
                {busy === type ? '...' : actif ? 'Armé' : inutilisable ? 'QCM seulement' : 'Jouer'}
              </span>
            </button>
          );
        })}
      </div>
      {error && <p className="anim-shake mt-2 text-center text-sm font-semibold text-rose-400">{error}</p>}
    </div>
  );
}
