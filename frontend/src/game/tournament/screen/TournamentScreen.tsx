/**
 * Écran du bar pendant un tournoi (monté par ScreenApp quand la session
 * courante est un tournoi) : PROJO ou BAR selon le hostname. Suit la session
 * en temps réel et rend l'écran d'attente dès qu'elle est close.
 */

import { useTournamentSession, useServerNow } from '../useTournamentSession';
import TournamentProjo from './TournamentProjo';
import TournamentBar from './TournamentBar';

export default function TournamentScreen({
  sessionId,
  isProjector,
  idle,
}: {
  sessionId: string;
  isProjector: boolean;
  /** écran rendu une fois le tournoi clos (le poste repart vers son défaut) */
  idle: React.ReactNode;
}) {
  const { state } = useTournamentSession(sessionId, null);
  const now = useServerNow(500);
  if (!state || state.ended) return <>{idle}</>;
  if (!isProjector) {
    return (
      <div className="h-dvh overflow-hidden">
        <TournamentBar state={state} now={now} />
      </div>
    );
  }
  return (
    <div className="h-dvh overflow-hidden">
      <TournamentProjo state={state} now={now} />
    </div>
  );
}
