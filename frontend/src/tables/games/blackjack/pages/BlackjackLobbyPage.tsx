/**
 * Lobby du blackjack : créer une table, s'asseoir aux tables en attente
 * (ou en cours si elles acceptent les retardataires), regarder les autres.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import AnimatedGrid, { AnimatedGridItem } from '../../../components/ui/AnimatedGrid';
import RetroLoader from '../../../components/ui/RetroLoader';
import BackButton from '../../../components/layout/BackButton';
import HeaderBar from '../../../components/layout/HeaderBar';
import { Plus } from 'lucide-react';
import { useT } from '../../../i18n/useT';
import BjNotice from '../components/BjNotice';
import CreateTableModal from '../components/CreateTableModal';
import JoinPseudoModal from '../components/JoinPseudoModal';
import LobbyTableCard from '../components/LobbyTableCard';
import { useBjLobby } from '../hooks/useBjLobby';
import { bjApi, bjErrorKey } from '../lib/bjApi';
import { getBjIdentity, saveBjIdentity, saveLastPseudo } from '../lib/identity';
import type { BjLobbyItem, CreateBjInput } from '../lib/bjTypes';

export default function BlackjackLobbyPage() {
  const t = useT();
  const navigate = useNavigate();
  const { items, loading } = useBjLobby();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinTarget, setJoinTarget] = useState<BjLobbyItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, []);

  function showError(err: unknown) {
    const key = bjErrorKey(err).replace(/^error_/, '');
    setNotice(t(`table.bj.error.${key}`, t('table.bj.error.generic')));
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3000);
  }

  async function handleCreate(input: CreateBjInput) {
    setBusy(true);
    try {
      const res = await bjApi.create(input);
      saveLastPseudo(input.pseudo);
      saveBjIdentity(res.sessionId, { playerToken: res.playerToken, pseudo: input.pseudo });
      navigate(`/table/games/blackjack/${res.sessionId}`);
    } catch (err) {
      showError(err);
      setBusy(false);
    }
  }

  async function handleJoin(item: BjLobbyItem, pseudo: string) {
    setBusy(true);
    try {
      const res = await bjApi.join(item.sessionId, { pseudo });
      saveLastPseudo(pseudo);
      if (res.you) {
        saveBjIdentity(res.sessionId, { playerToken: res.playerToken, pseudo });
      }
      navigate(`/table/games/blackjack/${res.sessionId}`);
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
      <BjNotice message={notice} />
      <HeaderBar
        title={t('table.bj.title').toUpperCase()}
        left={<BackButton to="/table/games" label={t('table.games.title')} />}
        right={
          <ArcadeButton variant="accent" size="lg" icon={<Plus className="h-5 w-5" />} onClick={() => setCreateOpen(true)}>
            {t('table.bj.lobby.create')}
          </ArcadeButton>
        }
      />

      <div className="mt-6 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <RetroLoader />
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-6">
            <div className="font-display text-3xl uppercase tracking-wide text-table-ink-muted">
              {t('table.bj.lobby.empty')}
            </div>
            <ArcadeButton variant="accent" size="xl" icon={<Plus className="h-6 w-6" />} onClick={() => setCreateOpen(true)}>
              {t('table.bj.lobby.create')}
            </ArcadeButton>
          </div>
        ) : (
          <AnimatedGrid resetKey={`bj${items.length}`} className="flex flex-col gap-4">
            {waiting.length > 0 && (
              <AnimatedGridItem>
                <div className="mb-2 font-display text-lg font-bold uppercase tracking-[0.2em] text-table-ink-muted">
                  {t('table.bj.lobby.waiting')}
                </div>
              </AnimatedGridItem>
            )}
            {waiting.map((item) => (
              <AnimatedGridItem key={item.sessionId}>
                <LobbyTableCard
                  item={item}
                  isMine={getBjIdentity(item.sessionId) !== null}
                  onJoin={() => setJoinTarget(item)}
                  onResume={() => navigate(`/table/games/blackjack/${item.sessionId}`)}
                  onWatch={() => navigate(`/table/games/blackjack/${item.sessionId}`)}
                />
              </AnimatedGridItem>
            ))}
            {running.length > 0 && (
              <AnimatedGridItem>
                <div className="mb-2 mt-5 font-display text-lg font-bold uppercase tracking-[0.2em] text-table-ink-muted">
                  {t('table.bj.lobby.playing')}
                </div>
              </AnimatedGridItem>
            )}
            {running.map((item) => (
              <AnimatedGridItem key={item.sessionId}>
                <LobbyTableCard
                  item={item}
                  isMine={getBjIdentity(item.sessionId) !== null}
                  onJoin={() => setJoinTarget(item)}
                  onResume={() => navigate(`/table/games/blackjack/${item.sessionId}`)}
                  onWatch={() => navigate(`/table/games/blackjack/${item.sessionId}`)}
                />
              </AnimatedGridItem>
            ))}
          </AnimatedGrid>
        )}
      </div>

      <CreateTableModal open={createOpen} busy={busy} onClose={() => setCreateOpen(false)} onCreate={handleCreate} />
      <JoinPseudoModal
        open={joinTarget !== null}
        busy={busy}
        onClose={() => setJoinTarget(null)}
        onJoin={(pseudo) => joinTarget && void handleJoin(joinTarget, pseudo)}
      />
    </div>
  );
}
