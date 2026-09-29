/**
 * Saisie du pseudo avant de rejoindre une partie (clavier tactile système,
 * comme le join quiz depuis une borne).
 */

import { useState } from 'react';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import ArcadeModal from '../../../components/ui/ArcadeModal';
import { useT } from '../../../i18n/useT';
import { getLastPseudo } from '../lib/identity';
import { isValidPseudo } from '../lib/pseudo';
import { useTournamentLookup } from '../hooks/useTournamentLookup';
import { TournamentPseudoHint } from './TournamentBadge';

interface Props {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onJoin: (pseudo: string) => void;
  /** joueur déjà assis : sert à dire si la partie comptera pour le tournoi */
  opponentPseudo?: string | null;
}

export default function JoinPseudoModal({ open, busy, onClose, onJoin, opponentPseudo = null }: Props) {
  const t = useT();
  const [pseudo, setPseudo] = useState<string>(() => getLastPseudo());
  const tournament = useTournamentLookup(pseudo, open, opponentPseudo);

  return (
    <ArcadeModal open={open} onClose={onClose} title={t('table.chess.lobby.join')} size={tournament ? 'lg' : 'md'}>
      <div className="flex flex-col gap-5">
        <input
          value={pseudo}
          onChange={(e) => setPseudo(e.target.value)}
          maxLength={16}
          placeholder={t('table.chess.create.pseudoPlaceholder')}
          className="w-full rounded-2xl border border-white/15 bg-black/40 px-5 py-3.5 text-xl text-table-ink outline-none placeholder:text-table-ink-muted focus:border-table-cyan/70"
        />
        {tournament && <TournamentPseudoHint lookup={tournament} onUsePseudo={setPseudo} />}
        <ArcadeButton
          variant="accent"
          size="lg"
          fullWidth
          disabled={busy || !isValidPseudo(pseudo)}
          onClick={() => onJoin(pseudo.trim())}
        >
          {t('table.chess.lobby.join')}
        </ArcadeButton>
      </div>
    </ArcadeModal>
  );
}
