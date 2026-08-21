/**
 * Bandeau d'invitation générale : quand une table en salle d'attente
 * « invite tout le bar », les dalles qui traînent sur le menu, la carte ou
 * la liste des jeux voient ce bandeau débouler du haut de l'écran, aux
 * couleurs du jeu, avec un bouton pour rejoindre directement la partie.
 *
 * Même langage que le bandeau événements de la home : l'icône descend, le
 * fond se déploie, le texte apparaît. Se ferme seul au bout de 12 s.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Crown, Spade, X } from 'lucide-react';
import { useRealtimeTopic } from '../../hooks/useRealtimeTopic';
import { useT } from '../../i18n/useT';
import { EASE_OUT_QUART } from '../../lib/motion';

interface Invite {
  game: 'chess' | 'blackjack';
  sessionId: string;
  pseudo: string;
  at: number;
}

interface Props {
  /** le bandeau ne s'affiche que hors partie (menu, carte, jeux, lobbys) */
  enabled: boolean;
}

const VISIBLE_MS = 12_000;

const GAME_STYLE: Record<Invite['game'], { accent: string; bg: string; icon: React.ReactNode; labelKey: string }> = {
  blackjack: {
    accent: '#E8C267',
    bg: 'linear-gradient(90deg, rgba(67,16,30,0.97), rgba(48,10,21,0.97))',
    icon: <Spade className="h-8 w-8" />,
    labelKey: 'table.invite.blackjack',
  },
  chess: {
    accent: '#33E2FF',
    bg: 'linear-gradient(90deg, rgba(19,26,56,0.97), rgba(11,14,31,0.97))',
    icon: <Crown className="h-8 w-8" />,
    labelKey: 'table.invite.chess',
  },
};

export default function InviteBanner({ enabled }: Props) {
  const t = useT();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<Invite | null>(null);
  const timer = useRef<number | null>(null);
  const seen = useRef<Set<string>>(new Set());

  const dismiss = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setInvite(null);
  }, []);

  useRealtimeTopic('tables:invites', (e) => {
    if (e.event !== 'invite') return;
    const payload = e.payload as unknown as Invite;
    if (!payload?.sessionId || !payload.game || !(payload.game in GAME_STYLE)) return;
    // chaque envoi s'affiche une fois par dalle
    const key = `${payload.sessionId}:${payload.at}`;
    if (seen.current.has(key)) return;
    seen.current.add(key);
    if (seen.current.size > 100) seen.current.clear();
    if (timer.current) window.clearTimeout(timer.current);
    setInvite(payload);
    timer.current = window.setTimeout(() => setInvite(null), VISIBLE_MS);
  });

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const shown = enabled ? invite : null;
  const style = shown ? GAME_STYLE[shown.game] : null;

  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-[70] -translate-x-1/2">
      <AnimatePresence>
        {shown && style && (
          <motion.div
            key={`${shown.sessionId}-${shown.at}`}
            className="pointer-events-auto flex items-center gap-5 rounded-3xl border-2 py-4 pl-5 pr-4 shadow-2xl"
            style={{ background: style.bg, borderColor: `${style.accent}88` }}
            initial={{ y: '-140%', opacity: 0 }}
            animate={{ y: 0, opacity: 1, transition: { duration: 0.45, ease: EASE_OUT_QUART } }}
            exit={{ y: '-140%', opacity: 0, transition: { duration: 0.3, ease: EASE_OUT_QUART } }}
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl" style={{ background: `${style.accent}1E`, color: style.accent }}>
              {style.icon}
            </span>
            <span className="max-w-[640px] font-display text-2xl font-bold leading-snug text-white">
              {t(style.labelKey).replace('{pseudo}', shown.pseudo || '?')}
            </span>
            <button
              className="flex h-14 items-center rounded-2xl px-6 font-display text-xl font-extrabold uppercase tracking-wide active:scale-95"
              style={{ background: style.accent, color: '#16101B' }}
              onClick={() => {
                dismiss();
                navigate(`/table/games/${shown.game}/${shown.sessionId}`);
              }}
            >
              {t('table.invite.join')}
            </button>
            <button
              className="flex h-14 w-12 items-center justify-center rounded-2xl text-white/60 active:scale-95"
              onClick={dismiss}
            >
              <X className="h-6 w-6" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
