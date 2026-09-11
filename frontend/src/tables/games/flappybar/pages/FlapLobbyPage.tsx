/**
 * Lobby de Flappy Bar. Deux zones : à gauche les parties du bar (en attente,
 * en cours) et la création ; à droite, en permanence, les records du bar.
 * Jamais derrière un bouton : c'est le tableau des records qui donne envie
 * de jouer.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import AnimatedGrid, { AnimatedGridItem } from '../../../components/ui/AnimatedGrid';
import RetroLoader from '../../../components/ui/RetroLoader';
import BackButton from '../../../components/layout/BackButton';
import HeaderBar from '../../../components/layout/HeaderBar';
import BarRecordsPanel from '../../../components/games/BarRecordsPanel';
import { useT } from '../../../i18n/useT';
import CreateFlapModal from '../components/CreateFlapModal';
import FlapNotice from '../components/FlapNotice';
import JoinPseudoModal from '../components/JoinPseudoModal';
import LobbyFlapCard from '../components/LobbyFlapCard';
import { useFlapLobby } from '../hooks/useFlapLobby';
import { flapApi, flapErrorKey } from '../lib/flapApi';
import { formatDuration } from '../lib/format';
import { getFlapIdentity, getLastPseudo, saveFlapIdentity, saveLastPseudo } from '../lib/identity';
import type { BarRecordItem, CreateFlapInput, FlapLobbyItem } from '../lib/flapTypes';

const ACCENT = '#FF3EA5';
const NOTICE_MS = 3_000;

interface SectionProps {
  title: string;
  titleClass: string;
  resetKey: string;
  items: FlapLobbyItem[];
  onJoin: (item: FlapLobbyItem) => void;
  onOpen: (item: FlapLobbyItem) => void;
}

/** une liste de parties sous son titre : en attente, ou en cours */
function SessionSection({ title, titleClass, resetKey, items, onJoin, onOpen }: SectionProps) {
  return (
    <section>
      <h2 className={`mb-3 font-display text-[22px] uppercase tracking-[0.3em] ${titleClass}`}>{title}</h2>
      <AnimatedGrid resetKey={resetKey} className="flex flex-col gap-3">
        {items.map((item) => (
          <AnimatedGridItem key={item.sessionId}>
            <LobbyFlapCard
              item={item}
              isMine={getFlapIdentity(item.sessionId) !== null}
              onJoin={() => onJoin(item)}
              onResume={() => onOpen(item)}
              onWatch={() => onOpen(item)}
            />
          </AnimatedGridItem>
        ))}
      </AnimatedGrid>
    </section>
  );
}

export default function FlapLobbyPage() {
  const t = useT();
  const navigate = useNavigate();
  const { items, loading } = useFlapLobby();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinTarget, setJoinTarget] = useState<FlapLobbyItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, []);

  function showError(err: unknown) {
    const key = flapErrorKey(err).replace(/^error_/, '');
    setNotice(t(`table.flap.error.${key}`, t('table.flap.error.generic')));
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_MS);
  }

  function openSession(sessionId: string) {
    navigate(`/table/games/flappybar/${sessionId}`);
  }

  async function handleCreate(input: CreateFlapInput) {
    setBusy(true);
    try {
      const res = await flapApi.create(input);
      saveLastPseudo(input.pseudo);
      saveFlapIdentity(res.sessionId, { playerToken: res.playerToken, pseudo: input.pseudo });
      openSession(res.sessionId);
    } catch (err) {
      showError(err);
      setBusy(false);
    }
  }

  async function handleJoin(item: FlapLobbyItem, pseudo: string) {
    setBusy(true);
    try {
      const res = await flapApi.join(item.sessionId, { pseudo });
      saveLastPseudo(pseudo);
      saveFlapIdentity(res.sessionId, { playerToken: res.playerToken, pseudo });
      openSession(res.sessionId);
    } catch (err) {
      // la modale reste ouverte et affiche l'erreur : le joueur corrige ou ferme
      showError(err);
      setBusy(false);
    }
  }

  /** sous le pseudo d'un record : tuyaux passés et temps de vol, si connus */
  function formatRecordDetails(item: BarRecordItem): string | null {
    const parts: string[] = [];
    const pipes = item.details?.pipes;
    if (typeof pipes === 'number') parts.push(t('table.flap.records.pipes').replace('{count}', String(pipes)));
    const timeMs = item.details?.timeMs;
    if (typeof timeMs === 'number') parts.push(formatDuration(timeMs));
    return parts.length > 0 ? parts.join(' · ') : null;
  }

  const waiting = items.filter((i) => i.status === 'lobby');
  const running = items.filter((i) => i.status === 'playing');

  return (
    <div className="relative flex h-full w-full flex-col px-8 py-6">
      <FlapNotice message={notice} />
      <HeaderBar
        title={t('table.flap.title').toUpperCase()}
        left={<BackButton to="/table/games" label={t('table.games.title')} />}
        right={
          // l'état vide porte déjà son propre gros CTA : pas deux boutons
          // identiques à l'écran (même règle qu'aux échecs et au blackjack)
          items.length > 0 ? (
            <ArcadeButton variant="accent" size="lg" icon={<Plus className="h-6 w-6" />} onClick={() => setCreateOpen(true)}>
              {t('table.flap.lobby.create')}
            </ArcadeButton>
          ) : null
        }
      />

      <div className="mt-6 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_560px] gap-6">
        {/* zone gauche : les parties */}
        <div className="tables-scroll min-h-0 overflow-y-auto pr-2">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <RetroLoader label={t('table.common.loading', 'LOADING')} />
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
              <div className="font-display text-4xl uppercase tracking-wide text-table-ink-soft">{t('table.flap.lobby.empty')}</div>
              <div className="max-w-xl text-2xl text-table-ink-muted">{t('table.flap.lobby.emptySub')}</div>
              <ArcadeButton
                variant="accent"
                size="xl"
                className="min-h-[72px]"
                icon={<Plus className="h-7 w-7" />}
                onClick={() => setCreateOpen(true)}
              >
                {t('table.flap.lobby.create')}
              </ArcadeButton>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {waiting.length > 0 && (
                <SessionSection
                  title={t('table.flap.lobby.waiting')}
                  titleClass="text-table-cyan/85"
                  resetKey={`w${waiting.length}`}
                  items={waiting}
                  onJoin={setJoinTarget}
                  onOpen={(item) => openSession(item.sessionId)}
                />
              )}
              {running.length > 0 && (
                <SessionSection
                  title={t('table.flap.lobby.playing')}
                  titleClass="text-table-magenta/85"
                  resetKey={`p${running.length}`}
                  items={running}
                  onJoin={setJoinTarget}
                  onOpen={(item) => openSession(item.sessionId)}
                />
              )}
            </div>
          )}
        </div>

        {/* zone droite : les records, toujours visibles */}
        <BarRecordsPanel
          mode="flappybar"
          title={t('table.flap.records.title', 'Records du bar')}
          limit={10}
          highlightPseudo={getLastPseudo()}
          accent={ACCENT}
          formatDetails={formatRecordDetails}
          emptyTitle={t('table.flap.records.empty')}
          emptySub={t('table.flap.records.emptySub')}
          className="min-h-0"
        />
      </div>

      <CreateFlapModal
        open={createOpen}
        busy={busy}
        error={createOpen ? notice : null}
        onClose={() => setCreateOpen(false)}
        onSubmit={(input) => void handleCreate(input)}
      />
      <JoinPseudoModal
        open={joinTarget !== null}
        busy={busy}
        error={joinTarget ? notice : null}
        onClose={() => setJoinTarget(null)}
        onSubmit={(pseudo) => joinTarget && void handleJoin(joinTarget, pseudo)}
      />
    </div>
  );
}
