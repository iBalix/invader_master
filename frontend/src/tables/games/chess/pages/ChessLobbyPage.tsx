/**
 * Lobby des échecs : créer une partie, rejoindre les parties en attente,
 * regarder les parties en cours. Multi-parties : tout le bar joue en parallèle.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import AnimatedGrid, { AnimatedGridItem } from '../../../components/ui/AnimatedGrid';
import RetroLoader from '../../../components/ui/RetroLoader';
import BackButton from '../../../components/layout/BackButton';
import HeaderBar from '../../../components/layout/HeaderBar';
import { useT } from '../../../i18n/useT';
import ChessNotice from '../components/ChessNotice';
import CreateGameModal from '../components/CreateGameModal';
import JoinPseudoModal from '../components/JoinPseudoModal';
import LobbyGameCard from '../components/LobbyGameCard';
import { useChessLobby } from '../hooks/useChessLobby';
import { chessApi, chessErrorKey } from '../lib/chessApi';
import { getChessIdentity, saveChessIdentity, saveLastPseudo } from '../lib/identity';
import type { ChessLobbyItem, CreateChessGameInput } from '../lib/chessTypes';

export default function ChessLobbyPage() {
  const t = useT();
  const navigate = useNavigate();
  const { items, loading } = useChessLobby();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinTarget, setJoinTarget] = useState<ChessLobbyItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, []);

  function showError(err: unknown) {
    const key = chessErrorKey(err).replace(/^error_/, '');
    setNotice(t(`table.chess.error.${key}`, t('table.chess.error.generic')));
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3000);
  }

  async function handleCreate(input: CreateChessGameInput) {
    setBusy(true);
    try {
      const res = await chessApi.create(input);
      saveLastPseudo(input.pseudo);
      saveChessIdentity(res.sessionId, {
        playerToken: res.playerToken,
        pseudo: input.pseudo,
        color: res.you.color,
      });
      navigate(`/table/games/chess/${res.sessionId}`);
    } catch (err) {
      showError(err);
      setBusy(false);
    }
  }

  async function handleJoin(item: ChessLobbyItem, pseudo: string) {
    setBusy(true);
    try {
      const res = await chessApi.join(item.sessionId, { pseudo });
      saveLastPseudo(pseudo);
      if (res.you) {
        saveChessIdentity(res.sessionId, {
          playerToken: res.playerToken,
          pseudo,
          color: res.you.color,
        });
      }
      navigate(`/table/games/chess/${res.sessionId}`);
    } catch (err) {
      showError(err);
      setBusy(false);
      setJoinTarget(null);
    }
  }

  const waiting = items.filter((i) => i.status === 'lobby');
  const running = items.filter((i) => i.status === 'playing');

  return (
    <div className="relative flex h-full w-full flex-col px-8 py-6">
      <ChessNotice message={notice} />
      <HeaderBar
        title={t('table.chess.title').toUpperCase()}
        left={<BackButton to="/table/games" label={t('table.games.title')} />}
        right={
          // l'état vide porte déjà son propre gros CTA : pas deux boutons
          // identiques à l'écran
          items.length > 0 ? (
            <ArcadeButton
              variant="accent"
              size="md"
              icon={<Plus className="h-5 w-5" />}
              onClick={() => setCreateOpen(true)}
            >
              {t('table.chess.lobby.create')}
            </ArcadeButton>
          ) : null
        }
      />

      <div className="tables-scroll mt-6 min-h-0 flex-1 overflow-y-auto pr-2">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <RetroLoader label={t('table.common.loading', 'LOADING')} accent="cyan" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
            <div className="font-display text-3xl uppercase tracking-wider text-table-ink-soft">
              {t('table.chess.lobby.empty')}
            </div>
            <ArcadeButton
              variant="primary"
              size="xl"
              icon={<Plus className="h-6 w-6" />}
              onClick={() => setCreateOpen(true)}
            >
              {t('table.chess.lobby.create')}
            </ArcadeButton>
          </div>
        ) : (
          <div className="mx-auto flex max-w-4xl flex-col gap-8">
            {waiting.length > 0 && (
              <section>
                <h2 className="mb-3 font-display text-lg uppercase tracking-[0.3em] text-table-cyan/85">
                  {t('table.chess.lobby.waiting')}
                </h2>
                <AnimatedGrid resetKey={`w${waiting.length}`} className="flex flex-col gap-3">
                  {waiting.map((item) => (
                    <AnimatedGridItem key={item.sessionId}>
                      <LobbyGameCard
                        item={item}
                        isMine={getChessIdentity(item.sessionId) !== null}
                        onJoin={() => setJoinTarget(item)}
                        onResume={() => navigate(`/table/games/chess/${item.sessionId}`)}
                        onWatch={() => navigate(`/table/games/chess/${item.sessionId}`)}
                      />
                    </AnimatedGridItem>
                  ))}
                </AnimatedGrid>
              </section>
            )}
            {running.length > 0 && (
              <section>
                <h2 className="mb-3 font-display text-lg uppercase tracking-[0.3em] text-table-magenta/85">
                  {t('table.chess.lobby.playing')}
                </h2>
                <AnimatedGrid resetKey={`p${running.length}`} className="flex flex-col gap-3">
                  {running.map((item) => (
                    <AnimatedGridItem key={item.sessionId}>
                      <LobbyGameCard
                        item={item}
                        isMine={getChessIdentity(item.sessionId) !== null}
                        onJoin={() => setJoinTarget(item)}
                        onResume={() => navigate(`/table/games/chess/${item.sessionId}`)}
                        onWatch={() => navigate(`/table/games/chess/${item.sessionId}`)}
                      />
                    </AnimatedGridItem>
                  ))}
                </AnimatedGrid>
              </section>
            )}
          </div>
        )}
      </div>

      <CreateGameModal
        open={createOpen}
        busy={busy}
        onClose={() => setCreateOpen(false)}
        onCreate={(input) => void handleCreate(input)}
      />
      <JoinPseudoModal
        open={joinTarget !== null}
        busy={busy}
        onClose={() => setJoinTarget(null)}
        onJoin={(pseudo) => joinTarget && void handleJoin(joinTarget, pseudo)}
      />
    </div>
  );
}
